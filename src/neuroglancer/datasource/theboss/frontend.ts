/**
 * @license
 * Copyright 2016 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @file
 * Support for NDstore (https://github.com/neurodata/ndstore) servers.
 */

import {ChunkManager} from 'neuroglancer/chunk_manager/frontend';
import {CompletionResult, registerDataSourceFactory} from 'neuroglancer/datasource/factory';
import {makeRequest, Token} from 'neuroglancer/datasource/theboss/api';
import {BossSourceParameters, TileChunkSourceParameters, VolumeChunkSourceParameters} from 'neuroglancer/datasource/theboss/base';
import {DataType, VolumeChunkSpecification, VolumeSourceOptions, VolumeType} from 'neuroglancer/sliceview/base';
import {defineParameterizedVolumeChunkSource, MultiscaleVolumeChunkSource as GenericMultiscaleVolumeChunkSource, VolumeChunkSource} from 'neuroglancer/sliceview/frontend';
import {applyCompletionOffset, getPrefixMatchesWithDescriptions} from 'neuroglancer/util/completion';
import {mat4, vec3} from 'neuroglancer/util/geom';
import {openShardedHttpRequest, sendHttpRequest} from 'neuroglancer/util/http_request';
import {parseArray, parseQueryStringParameters, verify3dDimensions, verify3dScale, verify3dVec, verifyEnumString, verifyInt, verifyObject, verifyObjectAsMap, verifyObjectProperty, verifyOptionalString, verifyString} from 'neuroglancer/util/json';
import {CancellablePromise, cancellableThen} from 'neuroglancer/util/promise';

let serverVolumeTypes = new Map<string, VolumeType>();
serverVolumeTypes.set('image', VolumeType.IMAGE);
serverVolumeTypes.set('annotation', VolumeType.IMAGE); // TODO: tmp treat annos as image tiles
//serverVolumeTypes.set('annotation', VolumeType.SEGMENTATION);

const VALID_ENCODINGS = new Set<string>(['npz', 'jpeg']);  //, 'raw', 'jpeg']);

// const VolumeChunkSource = defineParameterizedVolumeChunkSource(VolumeChunkSourceParameters);

const TileChunkSource = defineParameterizedVolumeChunkSource(TileChunkSourceParameters);

interface ChannelInfo {
  channelType: string;
  volumeType: VolumeType;
  dataType: DataType;
  description: string;
  key: string;
}

interface CoordinateFrameInfo {
  voxelSizeBase: vec3;
  voxelOffsetBase: vec3;
  imageSizeBase: vec3;
}

interface ScaleInfo {
  voxelSize: vec3;
  voxelOffset: vec3;
  imageSize: vec3;
  key: string;
}

interface ExperimentInfo {
  channels: Map<string, ChannelInfo>;
  scalingLevels: number;
  coordFrameKey: string;
  scales: ScaleInfo[];
  key: string;
  collection: string;
}

/**
 * This function adds scaling info by processing coordinate frame object and adding it to the
 * experiment.
 */
function parseCoordinateFrame(coordFrame: any, experimentInfo: ExperimentInfo): ExperimentInfo {
  verifyObject(coordFrame);

  experimentInfo.scales = parseScales(coordFrame, experimentInfo.scalingLevels);
  return experimentInfo;
}

function parseScales(coordFrameObj: any, scalingLevels: number): ScaleInfo[] {
  verifyObject(coordFrameObj);

  let voxelSizeBase = vec3.create(), voxelOffsetBase = vec3.create(), imageSizeBase = vec3.create();

  voxelSizeBase[0] = verifyObjectProperty(coordFrameObj, 'x_voxel_size', verifyInt);
  voxelSizeBase[1] = verifyObjectProperty(coordFrameObj, 'y_voxel_size', verifyInt);
  voxelSizeBase[2] = verifyObjectProperty(coordFrameObj, 'z_voxel_size', verifyInt);

  voxelOffsetBase[0] = verifyObjectProperty(coordFrameObj, 'x_start', verifyInt);
  voxelOffsetBase[1] = verifyObjectProperty(coordFrameObj, 'y_start', verifyInt);
  voxelOffsetBase[2] = verifyObjectProperty(coordFrameObj, 'z_start', verifyInt);

  imageSizeBase[0] = verifyObjectProperty(coordFrameObj, 'x_stop', verifyInt);
  imageSizeBase[1] = verifyObjectProperty(coordFrameObj, 'y_stop', verifyInt);
  imageSizeBase[2] = verifyObjectProperty(coordFrameObj, 'z_stop', verifyInt);

  let scales = new Array<ScaleInfo>();
  for (let i = 0; i < scalingLevels; i++) {
    scales.push(createScale(i, voxelSizeBase, voxelOffsetBase, imageSizeBase));
  }
  return scales;
}

function createScale(
    level: number, voxelSizeBase: vec3, voxelOffsetBase: vec3, imageSizeBase: vec3): ScaleInfo {
  // scale x and y, but not z
  // TODO: is neariso scaling z?
  let voxelSize = vec3.create();
  for (let i = 0; i < 2; i++) {
    voxelSize[i] = voxelSizeBase[i] / Math.pow(2, level);
  }
  voxelSize[2] = voxelSizeBase[2];

  let voxelOffset = vec3.create();
  for (let i = 0; i < 2; i++) {
    voxelOffset[i] = voxelOffsetBase[i] / Math.pow(2, level);
  }
  voxelOffset[2] = voxelOffsetBase[2];

  let imageSize = vec3.create();
  for (let i = 0; i < 2; i++) {
    imageSize[i] = imageSizeBase[i] / Math.pow(2, level);
  }
  imageSize[2] = imageSizeBase[2];

  let key = '' + level;

  return {
    voxelSize, voxelOffset, imageSize, key
  }
}

function getVolumeTypeFromChannelType(channelType: string) {
  let volumeType = serverVolumeTypes.get(channelType);
  if (volumeType === undefined) {
    volumeType = VolumeType.UNKNOWN;
  }
  return volumeType;
}

function parseChannelInfo(obj: any): ChannelInfo {
  verifyObject(obj);
  let channelType = verifyObjectProperty(obj, 'type', verifyString);

  let dataType = verifyObjectProperty(obj, 'datatype', x => verifyEnumString(x, DataType)); 
  if (channelType === 'annotation') 
  {
    dataType = DataType.UINT8; // force 3-channel UINT8 for annotation tiles 
  }
  return {
    channelType,
    description: verifyObjectProperty(obj, 'description', verifyString),
    volumeType: getVolumeTypeFromChannelType(channelType),
    dataType: dataType,
    key: verifyObjectProperty(obj, 'name', verifyString),
  };
}

function parseExperimentInfo(
    obj: any, chunkManager: ChunkManager, hostnames: string[], token: Token, collection: string,
    experiment: string): Promise<ExperimentInfo> {
  verifyObject(obj);
  let scales = new Array<ScaleInfo>(); /* empty for now */

  let channelPromiseArray = verifyObjectProperty(
      obj, 'channels',
      x => parseArray(
          x, x => getChannelInfo(chunkManager, hostnames, token, experiment, collection, x)));
  return Promise.all(channelPromiseArray)
    .then(channelArray => {
      let channels: Map<string, ChannelInfo> = new Map<string, ChannelInfo>();
      channels.set
      channelArray.forEach(channel => {channels.set(channel.key, channel)});
      return {
        channels: channels,
            scalingLevels: verifyObjectProperty(obj, 'num_hierarchy_levels', verifyInt),
            coordFrameKey: verifyObjectProperty(obj, 'coord_frame', verifyString), scales: scales,
            key: verifyObjectProperty(obj, 'name', verifyString),
            collection: verifyObjectProperty(obj, 'collection', verifyString),
      }
    });
}

const TILE_DIMS = [
  [0, 1],
  [0, 2],
  [1, 2],
];

const TILE_ORIENTATION = [
  'xy',
  'xz',
  'yz',
];

export class MultiscaleVolumeChunkSource implements GenericMultiscaleVolumeChunkSource {
  get dataType() {
    return this.channelInfo.dataType;
  }
  get numChannels() {
    if (this.channelInfo.channelType === 'annotation') {
      return 3; 
    } 
    else {
      return 1;
    }
  }
  get volumeType() {
    return this.channelInfo.volumeType;
  }

  /**
   * The Boss channel/layer name.
   */
  channel: string;

  /**
   * The authorization token for requests
   */
  token: Token;

  channelInfo: ChannelInfo;
  scales: ScaleInfo[];

  encoding: string;

  /**
   * The base voxel size in nm
   */
  voxelSize: vec3;

  /**
   * Fixed tileSize for now
   */
  tileSize = 1024;

  constructor(
      public chunkManager: ChunkManager, public baseUrls: string[],
      public experimentInfo: ExperimentInfo, token: Token, channel: string|undefined,
      public parameters: {[index: string]: any}) {
    if (channel === undefined) {
      const channelNames = Array.from(experimentInfo.channels.keys());
      if (channelNames.length !== 1) {
        throw new Error(`Experiment contains multiple channels: ${JSON.stringify(channelNames)}`);
      }
      channel = channelNames[0];
    }
    const channelInfo = experimentInfo.channels.get(channel);
    if (channelInfo === undefined) {
      throw new Error(
          `Specified channel ${JSON.stringify(channel)} is not one of the supported channels ${JSON.stringify(Array.from(experimentInfo.channels.keys()))}`);
    }
    this.channel = channel;
    this.channelInfo = channelInfo;
    console.log(this.channelInfo);
    this.scales = experimentInfo.scales;
    this.token = token;

    this.voxelSize = experimentInfo.scales[0].voxelSize;

    let encoding = verifyOptionalString(parameters['encoding']);
    if (encoding === undefined) {
      // encoding = this.volumeType === VolumeType.IMAGE ? 'jpeg' : 'npz';
      encoding = 'jpeg';
    } else {
      if (!VALID_ENCODINGS.has(encoding)) {
        throw new Error(`Invalid encoding: ${JSON.stringify(encoding)}.`);
      }
    }
    this.encoding = encoding;
  }

  getSources(volumeSourceOptions: VolumeSourceOptions) {
    let sources: VolumeChunkSource[][] = [];
    for (let scaleInfo of this.scales) {
      let alternatives = TILE_DIMS.map((dims, index) => {
        let voxelSize = vec3.clone(this.voxelSize);
        let chunkDataSize = vec3.fromValues(1, 1, 1);

        // tiles are NxMx1
        for (let i = 0; i < 2; ++i) {
          chunkDataSize[dims[i]] = this.tileSize;
        }

        let lowerVoxelBound = vec3.create(), upperVoxelBound = vec3.create();
        for (let i = 0; i < 3; ++i) {
          lowerVoxelBound[i] = scaleInfo.voxelOffset[i];
          upperVoxelBound[i] = scaleInfo.imageSize[i];
        }

        let spec = VolumeChunkSpecification.make({
          voxelSize,
          chunkDataSize,
          numChannels: this.numChannels,
          dataType: this.dataType, lowerVoxelBound, upperVoxelBound, volumeSourceOptions,
        });
        return TileChunkSource.get(this.chunkManager, spec, {
          baseUrls: this.baseUrls,
          collection: this.experimentInfo.collection,
          experiment: this.experimentInfo.key,
          channel: this.channel,
          resolution: scaleInfo.key,
          encoding: this.encoding,
          token: this.token,
          orientation: TILE_ORIENTATION[index],
          tilesize: this.tileSize,
        });
      });
      sources.push(alternatives);
    }
    return sources;
    /* // 3D cutout code
    return this.scales.map(scaleInfo => {
      let {voxelOffset, voxelSize} = scaleInfo;
      let baseVoxelOffset = vec3.create();
      for (let i = 0; i < 3; ++i) {
        baseVoxelOffset[i] = Math.ceil(voxelOffset[i]);
      }
      return VolumeChunkSpecification
          .getDefaults({
            numChannels: this.numChannels,
            volumeType: this.volumeType,
            dataType: this.dataType, voxelSize,
            transform: mat4.fromTranslation(
                mat4.create(), vec3.multiply(vec3.create(), voxelOffset, voxelSize)),
            baseVoxelOffset,
            upperVoxelBound: scaleInfo.imageSize, volumeSourceOptions,
          })
          .map(spec => VolumeChunkSource.get(this.chunkManager, spec, {
            baseUrls: this.baseUrls,
            collection: this.experimentInfo.collection,
            experiment: this.experimentInfo.key,
            channel: this.channel,
            resolution: scaleInfo.key,
            encoding: this.encoding,
            token: this.token,
          }));
    });
    */
  }

  /**
   * Meshes are not supported.
   */
  getMeshSource(): null {
    return null;
  }
};

const pathPattern = /^([^\/?]+)\/([^\/?]+)\/([^\/?]+)(?:\/([^\/?]+))?(?:\?(.*))?$/;

export function getExperimentInfo(
    chunkManager: ChunkManager, hostnames: string[], token: Token, experiment: string,
    collection: string): Promise<ExperimentInfo> {
  return chunkManager.memoize.getUncounted(
      {'hostnames': hostnames, 'experiment': experiment, 'collection': collection},
      () => makeRequest(
                hostnames, 'GET', `/v0.7/collection/${collection}/experiment/${experiment}/`, token,
                'json')
                .then(
                    value => parseExperimentInfo(
                        value, chunkManager, hostnames, token, collection, experiment)));
}

export function getChannelInfo(
    chunkManager: ChunkManager, hostnames: string[], token: Token, experiment: string,
    collection: string, channel: string): Promise<ChannelInfo> {
  return chunkManager.memoize.getUncounted(
      {
        'hostnames': hostnames,
        'token': token,
        'collection': collection,
        'experiment': experiment,
        'channel': channel
      },
      () => makeRequest(
                hostnames, 'GET',
                `/v0.7/collection/${collection}/experiment/${experiment}/channel/${channel}/`,
                token, 'json')
                .then(parseChannelInfo))
}

export function getShardedVolume(chunkManager: ChunkManager, hostnames: string[], path: string) {
  const match = path.match(pathPattern);
  if (match === null) {
    throw new Error(`Invalid volume path ${JSON.stringify(path)}`);
  }
  const token = match[1];
  const collection = match[2];
  const experiment = match[3];
  const channel = match[4];
  const parameters = parseQueryStringParameters(match[5] || '');
  // Warning: If additional arguments are added, the cache key should be updated as well.
  return chunkManager.memoize.getUncounted(
      {'hostnames': hostnames, 'path': path},
      // TODO: we might need a catch here?
      () => getExperimentInfo(chunkManager, hostnames, token, experiment, collection)
                .then(
                    experimentInfo => getCoordinateFrame(
                                          chunkManager, hostnames, token,
                                          experimentInfo.coordFrameKey, experimentInfo)
                                          .then(
                                              experimentInfo => new MultiscaleVolumeChunkSource(
                                                  chunkManager, hostnames, experimentInfo, token,
                                                  channel, parameters))));
}

const urlPattern = /^((?:http|https):\/\/[^\/?]+)\/(.*)$/;

export function getVolume(chunkManager: ChunkManager, path: string) {
  let match = path.match(urlPattern);
  if (match === null) {
    throw new Error(`Invalid boss volume path: ${JSON.stringify(path)}`);
  }
  return getShardedVolume(chunkManager, [match[1]], match[2]);
}

export function getCollections(chunkManager: ChunkManager, hostnames: string[], token: Token) {
  return chunkManager.memoize.getUncounted(
      hostnames,
      () => makeRequest(hostnames, 'GET', '/v0.7/collection/', token, 'json')
                .then(
                    value => verifyObjectProperty(
                        value, 'collections', x => parseArray(x, verifyString))));
}

export function getExperiments(
    chunkManager: ChunkManager, hostnames: string[], token: Token, collection: string) {
  return chunkManager.memoize.getUncounted(
      {'hostnames': hostnames, 'collection': collection},
      () =>
          makeRequest(hostnames, 'GET', `/v0.7/collection/${collection}/experiment/`, token, 'json')
              .then(
                  value => verifyObjectProperty(
                    value, 'experiments', x => parseArray(x, verifyString))));
}

export function getCoordinateFrame(
    chunkManager: ChunkManager, hostnames: string[], token: Token, key: string,
    experimentInfo: ExperimentInfo): Promise<ExperimentInfo> {
  return chunkManager.memoize.getUncounted(
      {'hostnames': hostnames, 'coordinateframe': key},
      () =>
          makeRequest(hostnames, 'GET', `/v0.7/coord/${key}/`, token, 'json')
              .then(
                  coordinateFrameObj => parseCoordinateFrame(coordinateFrameObj, experimentInfo)));
}

export function tokenCollectionAndExperimentCompleter(
    chunkManager: ChunkManager, hostnames: string[],
    path: string): CancellablePromise<CompletionResult> {
  let channelMatch = path.match(/^(?:([^\/]+)(?:\/?([^\/]*)(?:\/?([^\/]*)(?:\/?([^\/]*)?))?)?)?$/);
  console.log(channelMatch);
  if (channelMatch === null) {
    // URL has incorrect format, don't return any results.
    return Promise.reject<CompletionResult>(null);
  }
  if (channelMatch[2] === undefined) {
    // No token. Reject.
    return Promise.reject<CompletionResult>(null);
  }
  if (channelMatch[3] === undefined) {
    let collectionPrefix = channelMatch[2] || '';
    // Try to complete the collection.
    return getCollections(chunkManager, hostnames, channelMatch[1])
      .then(collections => {
        return {
          offset: channelMatch![1].length + 1,
          completions: getPrefixMatchesWithDescriptions(
              collectionPrefix, collections, x => x + '/', () => undefined)
        };
    });
  }
  if (channelMatch[4] === undefined) {
    let experimentPrefix = channelMatch[3] || '';
    return getExperiments(chunkManager, hostnames, channelMatch[1], channelMatch[2])
        .then(experiments => {
          return {
            offset: channelMatch![1].length + channelMatch![2].length + 2,
            completions: getPrefixMatchesWithDescriptions(
                experimentPrefix, experiments, y => y + '/', () => undefined)
          };
        });
    
  }
  // try to complete the channel TODO
  return cancellableThen(
      getExperimentInfo(chunkManager, hostnames, channelMatch[1], channelMatch[3], channelMatch[2]),
      experimentInfo => {
        let completions = getPrefixMatchesWithDescriptions(
            channelMatch![2], experimentInfo.channels, x => x[0], x => {
              return `${x[1].channelType} (${DataType[x[1].dataType]})`;
            });
        return {offset: channelMatch![1].length + channelMatch![2].length + 1, completions};
      });
}

export function volumeCompleter(
    url: string, chunkManager: ChunkManager): CancellablePromise<CompletionResult> {
  let match = url.match(urlPattern);
  if (match === null) {
    // We don't yet have a full hostname.
    return Promise.reject<CompletionResult>(null);
  }
  let hostnames = [match[1]];
  let path = match[2];
  return cancellableThen(
      tokenCollectionAndExperimentCompleter(chunkManager, hostnames, path),
      completions => applyCompletionOffset(match![1].length + 1, completions));
}

registerDataSourceFactory('theboss', {
  description: 'The Boss',
  volumeCompleter: volumeCompleter,
  getVolume: getVolume,
});
