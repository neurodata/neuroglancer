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

import {HttpError, openShardedHttpRequest} from 'neuroglancer/util/http_request';
import {CancellablePromise, makeCancellablePromise} from 'neuroglancer/util/promise';

export var numPendingRequests = 0;

export type Token = any;

export function makeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: 'arraybuffer'): CancellablePromise<ArrayBuffer>;
export function makeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: 'json'): CancellablePromise<any>;
export function makeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string): any;

export function makeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string): any {
  /**
   * undefined means request not yet attempted.  null means request
   * cancelled.
   */
  let xhr: XMLHttpRequest|undefined|null = undefined;
  return makeCancellablePromise<any>((resolve, reject, onCancel) => {
    function start(token: Token) {
      if (xhr === null) {
        --numPendingRequests;
        return;
      }
      xhr = openShardedHttpRequest(baseUrls, path, method);
      xhr.responseType = responseType;
      xhr.setRequestHeader('Authorization', `Token ${token}`);
      xhr.onloadend = function(this: XMLHttpRequest) {
        if (xhr === null) {
          --numPendingRequests;
          return;
        }
        let status = this.status;
        if (status >= 200 && status < 300) {
          --numPendingRequests;
          resolve(this.response);
        } else if (status === 403 || status === 401) {
          // Authorization needed.
          // AB TODO
          --numPendingRequests;
          reject(HttpError.fromXhr(this));
        } else {
          --numPendingRequests;
          reject(HttpError.fromXhr(this));
        }
      };
      xhr.send();
    }
    onCancel(() => {
      let origXhr = xhr;
      xhr = null;
      if (origXhr != null) {
        origXhr.abort();
      }
    });
    start(token);
  });
}

export function makeVolumeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string): any {
  /**
   * undefined means request not yet attempted.  null means request
   * cancelled.
   */
  let xhr: XMLHttpRequest|undefined|null = undefined;
  return makeCancellablePromise<any>((resolve, reject, onCancel) => {
    function start(token: Token) {
      if (xhr === null) {
        --numPendingRequests;
        return;
      }
      xhr = openShardedHttpRequest(baseUrls, path, method);
      xhr.responseType = responseType;
      xhr.setRequestHeader('Authorization', `Token ${token}`);
      xhr.setRequestHeader('Accept', 'application/blosc-python');
      xhr.onloadend = function(this: XMLHttpRequest) {
        if (xhr === null) {
          --numPendingRequests;
          return;
        }
        let status = this.status;
        if (status >= 200 && status < 300) {
          --numPendingRequests;
          resolve(this.response);
        } else if (status === 403 || status === 401) {
          // Authorization needed.
          // AB TODO
          --numPendingRequests;
          reject(HttpError.fromXhr(this));
        } else {
          --numPendingRequests;
          reject(HttpError.fromXhr(this));
        }
      };
      xhr.send();
    }
    onCancel(() => {
      let origXhr = xhr;
      xhr = null;
      if (origXhr != null) {
        origXhr.abort();
      }
    });
    start(token);
  });
}

export function makeTileRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string): any {
  /**
   * undefined means request not yet attempted.  null means request
   * cancelled.
   */
  let xhr: XMLHttpRequest|undefined|null = undefined;
  return makeCancellablePromise<any>((resolve, reject, onCancel) => {
    function start(token: Token) {
      if (xhr === null) {
        --numPendingRequests;
        return;
      }
      xhr = openShardedHttpRequest(baseUrls, path, method);
      xhr.responseType = responseType;
      xhr.setRequestHeader('Authorization', `Token ${token}`);
      xhr.setRequestHeader('Accept', 'image/jpeg');
      xhr.onloadend = function(this: XMLHttpRequest) {
        if (xhr === null) {
          --numPendingRequests;
          return;
        }
        let status = this.status;
        if (status >= 200 && status < 300) {
          --numPendingRequests;
          resolve(this.response);
        } else if (status === 403 || status === 401) {
          // Authorization needed.
          // AB TODO
          --numPendingRequests;
          reject(HttpError.fromXhr(this));
        } else {
          --numPendingRequests;
          reject(HttpError.fromXhr(this));
        }
      };
      xhr.send();
    }
    onCancel(() => {
      let origXhr = xhr;
      xhr = null;
      if (origXhr != null) {
        origXhr.abort();
      }
    });
    start(token);
  });
}