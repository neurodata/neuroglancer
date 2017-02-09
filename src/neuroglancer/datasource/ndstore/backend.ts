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
import {VolumeChunkSourceParameters, MeshSourceParameters} from 'neuroglancer/datasource/ndstore/base';
import {ParameterizedVolumeChunkSource, VolumeChunk} from 'neuroglancer/sliceview/backend';
import {decodeJsonManifestChunk, decodeTriangleVertexPositionsAndIndices, FragmentChunk, ManifestChunk, ParameterizedMeshSource} from 'neuroglancer/mesh/backend';
import {ChunkDecoder} from 'neuroglancer/sliceview/backend_chunk_decoders';
import {decodeJpegChunk} from 'neuroglancer/sliceview/backend_chunk_decoders/jpeg';
import {decodeNdstoreNpzChunk} from 'neuroglancer/sliceview/backend_chunk_decoders/ndstoreNpz';
import {decodeRawChunk} from 'neuroglancer/sliceview/backend_chunk_decoders/raw';
import {CancellationToken} from 'neuroglancer/util/cancellation';
import {openShardedHttpRequest, sendHttpRequest} from 'neuroglancer/util/http_request';
import {Endianness} from 'neuroglancer/util/endian';
import {inflate} from 'pako';

let chunkDecoders = new Map<string, ChunkDecoder>();
chunkDecoders.set('npz', decodeNdstoreNpzChunk);
chunkDecoders.set('jpeg', decodeJpegChunk);
chunkDecoders.set('raw', decodeRawChunk);

@registerChunkSource(VolumeChunkSourceParameters)
class VolumeChunkSource extends ParameterizedVolumeChunkSource<VolumeChunkSourceParameters> {
  chunkDecoder = chunkDecoders.get(this.parameters.encoding)!;

  download(chunk: VolumeChunk, cancellationToken: CancellationToken) {
    let {parameters} = this;
    let path = `/ocp/ca/${parameters.key}/${parameters.channel}/` +
        `${parameters.encoding}/${parameters.resolution}`;
    {
      // chunkPosition must not be captured, since it will be invalidated by the next call to
      // computeChunkBounds.
      let chunkPosition = this.computeChunkBounds(chunk);
      let chunkDataSize = chunk.chunkDataSize!;
      for (let i = 0; i < 3; ++i) {
        path += `/${chunkPosition[i]},${chunkPosition[i] + chunkDataSize[i]}`;
      }
    }
    path += `/neariso/`;
    return sendHttpRequest(
               openShardedHttpRequest(parameters.baseUrls, path), 'arraybuffer', cancellationToken)
        .then(response => this.chunkDecoder(chunk, response));
  }
}

function decodeFragmentChunk(chunk: FragmentChunk, response: ArrayBuffer) {
  // response = inflate(new Uint8Array(response)).buffer;
  //response = new Uint8Array(response.slice(0))
  let dv = new DataView(response);
  let numVertices = dv.getUint32(0, true);
  let numVerticesHigh = dv.getUint32(4, true);
  if (numVerticesHigh !== 0) {
    throw new Error(`The number of vertices should not exceed 2^32-1.`);
  }
  decodeTriangleVertexPositionsAndIndices(
      chunk, response, Endianness.LITTLE, /*vertexByteOffset=*/8, numVertices);
}

// TODO: check out single mesh 

@registerChunkSource(MeshSourceParameters)
class MeshSource extends ParameterizedMeshSource<MeshSourceParameters> {
  download(chunk: ManifestChunk, cancellationToken: CancellationToken)
  {
    console.log(chunk);
    console.log(cancellationToken); 
    chunk.fragmentIds = new Array<string>(); 
    chunk.fragmentIds.push("0");     
    return new Promise<void>((resolve, reject) => {
      let fragmentKeys: string[] = new Array<string>(); 
      fragmentKeys.push("0");
      resolve();
      reject(); 
    });
  }
  
  downloadFragment(chunk: FragmentChunk, cancellationToken: CancellationToken) {
    let {parameters} = this; 
    const tmpUrl = `http://brainviz1.cs.jhu.edu/shapes/harris15`
    const path = `/apical.${chunk.manifestChunk!.objectId}.bin`;
    return sendHttpRequest(
      openShardedHttpRequest(tmpUrl, path), 'arraybuffer', cancellationToken)
      .then(response => decodeFragmentChunk(chunk, response)); 
  }
}