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

import {Chunk, ChunkManager, ChunkSource} from 'neuroglancer/chunk_manager/backend';
import {ChunkPriorityTier} from 'neuroglancer/chunk_manager/base';
import {POINT_RENDERLAYER_RPC_ID, PointChunkSource as PointChunkSourceInterface, PointChunkSpecification, RenderLayer as RenderLayerInterface} from 'neuroglancer/point/base';
import {RenderLayer as SliceViewRenderLayer, SliceViewChunk, SliceViewChunkSource} from 'neuroglancer/sliceview/backend';
import {CancellationToken} from 'neuroglancer/util/cancellation';
import {vec3, vec3Key} from 'neuroglancer/util/geom';
import {UseCount} from 'neuroglancer/util/use_count';
import {registerRPC, registerSharedObject, RPC, SharedObjectCounterpart} from 'neuroglancer/worker_rpc';

export class PointChunk extends SliceViewChunk {
  source: PointChunkSource|null = null;
  vertexPositions: Float32Array|null = null;
  vertexNormals: Float32Array|null = null;
  hasVertexNormals: boolean = false; 
  constructor() {
    super();
  }

  initializeVolumeChunk(key: string, chunkGridPosition: vec3) {
    super.initializeVolumeChunk(key, chunkGridPosition);

    let source = this.source;

    this.systemMemoryBytes = source!.spec.chunkBytes;
    this.gpuMemoryBytes = source!.spec.chunkBytes;

    this.vertexPositions = null;
    this.vertexNormals = null;
  }


  serialize(msg: any, transfers: any[]) {
    super.serialize(msg, transfers);
    let {vertexPositions, vertexNormals} = this;
    msg['vertexPositions'] = vertexPositions;
    let vertexPositionsBuffer = vertexPositions!.buffer;
    transfers.push(vertexPositionsBuffer);

    // TODO: might be able to switch this back to checking if vertexNormals are null
    if (this.hasVertexNormals) {
      msg['vertexNormals'] = vertexNormals;
      let vertexNormalsBuffer = vertexNormals!.buffer;
      transfers.push(vertexNormalsBuffer);
    }
    this.vertexNormals = null; 
    this.vertexPositions = null;
  }

  downloadSucceeded() {
    let byteLength = this.vertexPositions!.byteLength; 
    if (this.vertexNormals !== null) {
      byteLength += this.vertexNormals!.byteLength;
    }
    this.systemMemoryBytes = this.gpuMemoryBytes = byteLength;
    super.downloadSucceeded();
  }

  freeSystemMemory() {
    this.vertexPositions = null;
    this.vertexNormals = null; 
  }
};

// @registerSharedObject(POINT_SOURCE_RPC_ID)
export abstract class PointChunkSource extends SliceViewChunkSource implements
    PointChunkSourceInterface {
  spec: PointChunkSpecification;

  constructor(rpc: RPC, options: any) {
    super(rpc, options);
    this.spec = PointChunkSpecification.fromObject(options['spec']);
  }

  getChunk(chunkGridPosition: vec3) {
    let key = vec3Key(chunkGridPosition);
    let chunk = <PointChunk>this.chunks.get(key);
    if (chunk === undefined) {
      chunk = this.getNewChunk_(PointChunk);
      chunk.initializeVolumeChunk(key, chunkGridPosition);
      this.addChunk(chunk);
    }
    return chunk;
  }
};

@registerSharedObject(POINT_RENDERLAYER_RPC_ID)
export class RenderLayer extends SliceViewRenderLayer implements RenderLayerInterface {
  rpcId: number;
  sources: PointChunkSource[][];

  constructor(rpc: RPC, options: any) {
    super(rpc, options);
    let sources = this.sources = new Array<PointChunkSource[]>();
    for (let alternativeIds of options['sources']) {
      let alternatives = new Array<PointChunkSource>();
      sources.push(alternatives);
      for (let sourceId of alternativeIds) {
        let source: PointChunkSource = rpc.get(sourceId);
        this.registerDisposer(source.addRef());
        alternatives.push(source);
      }
    }
  }
}


export abstract class ParameterizedPointChunkSource<Parameters> extends PointChunkSource {
  parameters: Parameters;
  constructor(rpc: RPC, options: any) {
    super(rpc, options);
    this.parameters = options['parameters'];
  }
};
