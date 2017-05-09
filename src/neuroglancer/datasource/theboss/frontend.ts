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
 * Support for The Boss (https://github.com/jhuapl-boss) servers.
 */

import {ChunkManager} from 'neuroglancer/chunk_manager/frontend';
import {CompletionResult, registerDataSourceFactory} from 'neuroglancer/datasource/factory';
import {makeRequest} from 'neuroglancer/datasource/theboss/api';
import {BossSourceParameters, VolumeChunkSourceParameters, MeshSourceParameters} from 'neuroglancer/datasource/theboss/base';
import {DataType, VolumeChunkSpecification, VolumeSourceOptions, VolumeType} from 'neuroglancer/sliceview/base';
import {defineParameterizedVolumeChunkSource, MultiscaleVolumeChunkSource as GenericMultiscaleVolumeChunkSource} from 'neuroglancer/sliceview/frontend';
import {defineParameterizedMeshSource} from 'neuroglancer/mesh/frontend';
import {applyCompletionOffset, getPrefixMatchesWithDescriptions} from 'neuroglancer/util/completion';
import {mat4, vec3} from 'neuroglancer/util/geom';
import {openShardedHttpRequest, sendHttpRequest} from 'neuroglancer/util/http_request';
import {parseArray, parseQueryStringParameters, verify3dDimensions, verify3dScale, verify3dVec, verifyEnumString, verifyInt, verifyObject, verifyObjectAsMap, verifyObjectProperty, verifyOptionalString, verifyString} from 'neuroglancer/util/json';

import {CancellationToken, uncancelableToken, CANCELED} from 'neuroglancer/util/cancellation';
import {getToken} from 'neuroglancer/datasource/theboss/api_frontend';
import {Token} from 'neuroglancer/datasource/theboss/api';

let serverVolumeTypes = new Map<string, VolumeType>();
serverVolumeTypes.set('image', VolumeType.IMAGE);
serverVolumeTypes.set('annotation', VolumeType.SEGMENTATION);

const VALID_ENCODINGS = new Set<string>(['npz', 'jpeg']);  //, 'raw', 'jpeg']);

const DEFAULT_CUBOID_SIZE = vec3.fromValues(1024, 1024, 16);

const VolumeChunkSource = defineParameterizedVolumeChunkSource(VolumeChunkSourceParameters);
const MeshSource = defineParameterizedMeshSource(MeshSourceParameters);

interface ChannelInfo {
  channelType: string;
  volumeType: VolumeType;
  dataType: DataType;
  downsampled: boolean;
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
  imageSize: vec3;
  key: string;
}

interface ExperimentInfo {
  channels: Map<string, ChannelInfo>;
  scalingLevels: number;
  coordFrameKey: string;
  coordFrame: CoordinateFrameInfo;
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

  console.log(experimentInfo);

  let voxelSizeBase = vec3.create(), voxelOffsetBase = vec3.create(), imageSizeBase = vec3.create();  
  
  voxelSizeBase[0] = verifyObjectProperty(coordFrame, 'x_voxel_size', verifyInt);
  voxelSizeBase[1] = verifyObjectProperty(coordFrame, 'y_voxel_size', verifyInt);
  voxelSizeBase[2] = verifyObjectProperty(coordFrame, 'z_voxel_size', verifyInt);

  voxelOffsetBase[0] = verifyObjectProperty(coordFrame, 'x_start', verifyInt);
  voxelOffsetBase[1] = verifyObjectProperty(coordFrame, 'y_start', verifyInt);
  voxelOffsetBase[2] = verifyObjectProperty(coordFrame, 'z_start', verifyInt);

  imageSizeBase[0] = verifyObjectProperty(coordFrame, 'x_stop', verifyInt);
  imageSizeBase[1] = verifyObjectProperty(coordFrame, 'y_stop', verifyInt);
  imageSizeBase[2] = verifyObjectProperty(coordFrame, 'z_stop', verifyInt);

  experimentInfo.coordFrame = {voxelSizeBase, voxelOffsetBase, imageSizeBase};
  return experimentInfo;
}
/*
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
  let voxelSize = vec3.create();
  for (let i = 0; i < 2; i++) {
    voxelSize[i] = voxelSizeBase[i] * Math.pow(2, level);
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
*/
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
  let downsampleStatus: boolean = false;
  let downsampleStr = verifyObjectProperty(obj, 'downsample_status', verifyString);
  if (downsampleStr === 'DOWNSAMPLED') {
    downsampleStatus = true;
  } 

  return {
    channelType,
    description: verifyObjectProperty(obj, 'description', verifyString),
    volumeType: getVolumeTypeFromChannelType(channelType),
    dataType: verifyObjectProperty(obj, 'datatype', x => verifyEnumString(x, DataType)),
    downsampled: downsampleStatus,
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
      channelArray.forEach(channel => {channels.set(channel.key, channel)});
      let firstChannel = channels.values().next().value;
      
      return getDownsampleInfo(chunkManager, hostnames, token, collection, experiment, firstChannel.key).then(downsampleInfo => { return {
        channels: channels,
            scalingLevels: verifyObjectProperty(obj, 'num_hierarchy_levels', verifyInt),
            coordFrameKey: verifyObjectProperty(obj, 'coord_frame', verifyString), scales: downsampleInfo,
            key: verifyObjectProperty(obj, 'name', verifyString),
            collection: verifyObjectProperty(obj, 'collection', verifyString),
      }});

      
    });
}

export class MultiscaleVolumeChunkSource implements GenericMultiscaleVolumeChunkSource {
  get dataType() {
    if (this.channelInfo.dataType === DataType.UINT16) {
      // 16-bit channels automatically rescaled to uint8 by The Boss
      return DataType.UINT8;
    }
    return this.channelInfo.dataType;
  }
  get numChannels() {
    return 1;
  }
  get volumeType() {
    return this.channelInfo.volumeType;
  }

  /**
   * The Boss experiment name 
   */
  experiment: string; 

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
  coordinateFrame: CoordinateFrameInfo;

  encoding: string;

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
    this.scales = experimentInfo.scales;
    this.coordinateFrame = experimentInfo.coordFrame;
    if (this.channelInfo.downsampled === false) {
      this.scales = [experimentInfo.scales[0]]; 
    }
    this.token = token;
    this.experiment = experimentInfo.key;
  
    /*
    this.cuboidSize = DEFAULT_CUBOID_SIZE;
    let cuboidXY = verifyOptionalString(parameters['xySize']);
    if (cuboidXY !== undefined) {
      this.cuboidSize[0] = this.cuboidSize[1] = verifyInt(cuboidXY);
    }
    let cuboidZ = verifyOptionalString(parameters['zSize']);
    if (cuboidZ !== undefined) {
      this.cuboidSize[2] = verifyInt(cuboidZ);
    }
    */
    let encoding = verifyOptionalString(parameters['encoding']);
    if (encoding === undefined) {
      encoding = this.volumeType === VolumeType.IMAGE ? 'jpeg' : 'npz';
      console.log(encoding);
    } else {
      if (!VALID_ENCODINGS.has(encoding)) {
        throw new Error(`Invalid encoding: ${JSON.stringify(encoding)}.`);
      }
    }
    this.encoding = encoding;
  }

  getSources(volumeSourceOptions: VolumeSourceOptions) {
    console.log(this.scales);
    return this.scales.map(scaleInfo => {
      let {voxelSize, imageSize} = scaleInfo;
      let voxelOffset = this.coordinateFrame.voxelOffsetBase;
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
            upperVoxelBound: imageSize, volumeSourceOptions,
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
  }

  getMeshSource() {
    if (this.experiment === 'pinky10') {
      return MeshSource.get(this.chunkManager, {'baseUrls': this.baseUrls, 'channel': this.channel, 'meshName': 'test'});
    }
    return null; 
  }
};

const pathPattern = /^([^\/?]+)\/([^\/?]+)(?:\/([^\/?]+))?(?:\?(.*))?$/;

export function getExperimentInfo(
    chunkManager: ChunkManager, hostnames: string[], token: Token, experiment: string,
    collection: string): Promise<ExperimentInfo> {
  return chunkManager.memoize.getUncounted(
      {'hostnames': hostnames, 'experiment': experiment, 'collection': collection},
      () => makeRequest(
                hostnames, 'GET', `/latest/collection/${collection}/experiment/${experiment}/`, token,
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
                `/latest/collection/${collection}/experiment/${experiment}/channel/${channel}/`,
                token, 'json')
                .then(parseChannelInfo))
}

export function getDownsampleInfo(chunkManager: ChunkManager, hostnames: string[], token: Token, collection: string, experiment: string, channel: string): Promise<any> {
  return chunkManager.memoize.getUncounted({
    'hostnames': hostnames,
    'token': token,
    'collection': collection,
    'experiment': experiment,
    'channel': channel,
    'downsample': true
  },
  () => makeRequest(
    hostnames, 'GET', 
    `/latest/downsample/${collection}/${experiment}/${channel}/`, token, 'json')
  ).then(parseDownsampleInfo);
}

export function parseDownsampleInfo(downsampleObj: any): ScaleInfo[] {
  verifyObject(downsampleObj);
  console.log(downsampleObj);
  let voxelSizes = verifyObjectProperty(downsampleObj, 'voxel_size', x => verifyObjectAsMap(x, verify3dScale));
  let imageSizes = verifyObjectProperty(downsampleObj, 'extent', x => verifyObjectAsMap(x, verify3dDimensions));

  let num_hierarchy_levels = verifyObjectProperty(downsampleObj, 'num_hierarchy_levels', verifyInt);  

  let scaleInfo = new Array<ScaleInfo>();
  for(let i=0 ; i<num_hierarchy_levels ; i++) {
    let key: string = String(i);
    const voxelSize = voxelSizes.get(key);
    const imageSize = imageSizes.get(key);
    if (voxelSize === undefined || imageSize === undefined) {
      throw new Error(
          `Missing voxel_size/extent for resolution ${key}.`);
    }
    scaleInfo[i] = {voxelSize, imageSize, key};
  }
  return scaleInfo;
}

export function getShardedVolume(chunkManager: ChunkManager, hostnames: string[], path: string) {
  const match = path.match(pathPattern);
  if (match === null) {
    throw new Error(`Invalid volume path ${JSON.stringify(path)}`);
  }
  return getToken().then((token) => {
    const collection = match[1];
    const experiment = match[2];
    const channel = match[3];
    const parameters = parseQueryStringParameters(match[4] || '');
    // Warning: If additional arguments are added, the cache key should be updated as well.
    return chunkManager.memoize.getUncounted(
        {'hostnames': hostnames, 'path': path},
        () => getExperimentInfo(chunkManager, hostnames, token, experiment, collection)
                  .then(
                      experimentInfo => getCoordinateFrame(
                                            chunkManager, hostnames, token,
                                            experimentInfo.coordFrameKey, experimentInfo)
                                            .then(
                                                experimentInfo => new MultiscaleVolumeChunkSource(
                                                    chunkManager, hostnames, experimentInfo, token,
                                                    channel, parameters))));
  });
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
      () => makeRequest(hostnames, 'GET', '/latest/collection/', token, 'json')
                .then(
                    value => verifyObjectProperty(
                        value, 'collections', x => parseArray(x, verifyString))));
}

export function getExperiments(
    chunkManager: ChunkManager, hostnames: string[], token: Token, collection: string) {
  return chunkManager.memoize.getUncounted(
      {'hostnames': hostnames, 'collection': collection},
      () =>
          makeRequest(hostnames, 'GET', `/latest/collection/${collection}/experiment/`, token, 'json')
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
          makeRequest(hostnames, 'GET', `/latest/coord/${key}/`, token, 'json')
              .then(
                  coordinateFrameObj => parseCoordinateFrame(coordinateFrameObj, experimentInfo)));
}

export function tokenCollectionAndExperimentCompleter(
    chunkManager: ChunkManager, hostnames: string[],
    path: string): Promise<CompletionResult> {
    
  return getToken().then((token) => { 
    
    if (token === undefined) {
      return Promise.reject<CompletionResult>(null); 
    }

    let channelMatch = path.match(/^(?:([^\/]+)(?:\/?([^\/]*)(?:\/?([^\/]*)(?:\/?([^\/]*)?))?)?)?$/);
    if (channelMatch === null) {
      // URL has incorrect format, don't return any results.
      return Promise.reject<CompletionResult>(null);
    }
    if (channelMatch[1] === undefined) {
      // No token. Reject.
      return Promise.reject<CompletionResult>(null);
    }
    if (channelMatch[2] === undefined) {
      let collectionPrefix = channelMatch[1] || '';
      // Try to complete the collection.
      return getCollections(chunkManager, hostnames, token)
        .then(collections => {
          return {
            offset: 0,
            completions: getPrefixMatchesWithDescriptions(
                collectionPrefix, collections, x => x + '/', () => undefined)
          };
      });
    }
    if (channelMatch[3] === undefined) {
      let experimentPrefix = channelMatch[2] || '';
      return getExperiments(chunkManager, hostnames, token, channelMatch[1])
          .then(experiments => {
            return {
              offset: channelMatch![1].length + 1,
              completions: getPrefixMatchesWithDescriptions(
                  experimentPrefix, experiments, y => y + '/', () => undefined)
            };
          }); 
    }
    return getExperimentInfo(chunkManager, hostnames, token, channelMatch[2], channelMatch[1]).then(experimentInfo => {
      let completions = getPrefixMatchesWithDescriptions(
              channelMatch![3], experimentInfo.channels, x => x[0], x => {
                return `${x[1].channelType} (${DataType[x[1].dataType]})`;
              });
        return {offset: channelMatch![1].length + channelMatch![2].length + 2, completions};
    });
  });
}

export function volumeCompleter(
    url: string, chunkManager: ChunkManager): Promise<CompletionResult> {
  let match = url.match(urlPattern);
  if (match === null) {
    // We don't yet have a full hostname.
    return Promise.reject<CompletionResult>(null);
  }
  let hostnames = [match[1]];
  let path = match[2];
  return tokenCollectionAndExperimentCompleter(chunkManager, hostnames, path)
    .then(completions => applyCompletionOffset(match![1].length + 1, completions));
}

registerDataSourceFactory('theboss', {
  description: 'The Boss',
  volumeCompleter: volumeCompleter,
  getVolume: getVolume,
});
