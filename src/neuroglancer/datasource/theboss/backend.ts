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

import {registerChunkSource} from 'neuroglancer/chunk_manager/backend';
import {makeRequest, makeTileRequest, makeVolumeRequest, Token} from 'neuroglancer/datasource/theboss/api';
import {BossSourceParameters, TileChunkSourceParameters, VolumeChunkSourceParameters} from 'neuroglancer/datasource/theboss/base';
import {ParameterizedVolumeChunkSource, VolumeChunk} from 'neuroglancer/sliceview/backend';
import {ChunkDecoder} from 'neuroglancer/sliceview/backend_chunk_decoders';
import {decodeJpegChunk} from 'neuroglancer/sliceview/backend_chunk_decoders/jpeg';
import {decodeBossNpzChunk} from 'neuroglancer/sliceview/backend_chunk_decoders/bossNpz';
import {decodeRawChunk} from 'neuroglancer/sliceview/backend_chunk_decoders/raw';
import {openShardedHttpRequest, sendHttpRequest} from 'neuroglancer/util/http_request';
import {CancellationToken} from 'neuroglancer/util/cancellation';

let chunkDecoders = new Map<string, ChunkDecoder>();
chunkDecoders.set('npz', decodeBossNpzChunk);
chunkDecoders.set('jpeg', decodeJpegChunk);
// chunkDecoders.set('raw', decodeRawChunk);

@registerChunkSource(VolumeChunkSourceParameters)
class VolumeChunkSource extends ParameterizedVolumeChunkSource<VolumeChunkSourceParameters> {
  chunkDecoder = chunkDecoders.get(this.parameters.encoding)!;

  download(chunk: VolumeChunk, cancellationToken: CancellationToken) {
    let {parameters} = this;
    let path = 
      `/v0.7/cutout/${parameters.collection}/${parameters.experiment}/${parameters.channel}/${parameters.resolution}`;
    {
      // chunkPosition must not be captured, since it will be invalidated by the next call to
      // computeChunkBounds.
      let chunkPosition = this.computeChunkBounds(chunk);
      let chunkDataSize = chunk.chunkDataSize!;
      for (let i = 0; i < 3; ++i) {
        path += `/${chunkPosition[i]}:${chunkPosition[i] + chunkDataSize[i]}`;
      }
    }
    path += '/';

    // path += `/neariso/`;
    return makeVolumeRequest(parameters.baseUrls, 'GET', path, parameters.token, 'arraybuffer', cancellationToken)
      .then(response => this.chunkDecoder(chunk, response));
  }
};

@registerChunkSource(TileChunkSourceParameters)
class TileChunkSource extends ParameterizedVolumeChunkSource<TileChunkSourceParameters> {
  chunkDecoder = chunkDecoders.get(this.parameters.encoding)!;

  download(chunk: VolumeChunk, cancellationToken: CancellationToken) {
    let {parameters} = this;
    let {chunkGridPosition} = chunk;

    // Needed by decoder.
    chunk.chunkDataSize = this.spec.chunkDataSize;

    let path =
        `/v0.7/tile/${parameters.collection}/${parameters.experiment}/${parameters.channel}/${parameters.orientation}/${parameters.tilesize}/${parameters.resolution}/${chunkGridPosition[0]}/${chunkGridPosition[1]}/${chunkGridPosition[2]}/`;

    return makeTileRequest(parameters.baseUrls, 'GET', path, parameters.token, 'arraybuffer', cancellationToken)
      .then(response => this.chunkDecoder(chunk, response));
  }
}