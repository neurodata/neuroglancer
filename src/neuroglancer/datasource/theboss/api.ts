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
import {CancellationToken, uncancelableToken, CANCELED} from 'neuroglancer/util/cancellation';

export var numPendingRequests = 0;

export type Token = any;

export function makeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: 'arraybuffer', cancellationToken?: CancellationToken): Promise<ArrayBuffer>;
export function makeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: 'json', cancellationToken?: CancellationToken): Promise<any>;
export function makeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string, cancellationToken?: CancellationToken): any;

export function makeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string, cancellationToken: CancellationToken = uncancelableToken): any {
  /**
   * undefined means request not yet attempted.  null means request
   * cancelled.
   */
  let xhr: XMLHttpRequest|undefined|null = undefined;
  return new Promise<any>((resolve, reject) => { 
    const abort = () => {
      let origXhr = xhr;
      xhr = null;
      if (origXhr != null) {
        origXhr.abort();
      }
      reject(CANCELED);
    } 
    cancellationToken.add(abort);
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
    start(token);
  });
}

export function makeVolumeRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string, cancellationToken: CancellationToken = uncancelableToken): any {
  /**
   * undefined means request not yet attempted.  null means request
   * cancelled.
   */
  let xhr: XMLHttpRequest|undefined|null = undefined;
  return new Promise<any>((resolve, reject) => {
    const abort = () => {
      let origXhr = xhr;
      xhr = null;
      if (origXhr != null) {
        origXhr.abort();
      }
      reject(CANCELED);
    } 
    cancellationToken.add(abort);
    function start(token: Token) {
      if (xhr === null) {
        --numPendingRequests;
        return;
      }
      xhr = openShardedHttpRequest(baseUrls, path, method);
      xhr.responseType = responseType;
      xhr.setRequestHeader('Authorization', `Token ${token}`);
      xhr.setRequestHeader('Accept', 'application/npygz');
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
    start(token);
  });
}

export function makeTileRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string, cancellationToken?: CancellationToken): Promise<ArrayBuffer>;
export function makeTileRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string, cancellationToken?: CancellationToken): Promise<any>;
export function makeTileRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string, cancellationToken?: CancellationToken): any;

export function makeTileRequest(
    baseUrls: string|string[], method: string, path: string, token: string,
    responseType: string, cancellationToken: CancellationToken = uncancelableToken): any {
  /**
   * undefined means request not yet attempted.  null means request
   * cancelled.
   */
  let xhr: XMLHttpRequest|undefined|null = undefined;
  return new Promise<any>((resolve, reject) => {
    const abort = () => {
      let origXhr = xhr;
      xhr = null;
      if (origXhr != null) {
        origXhr.abort();
      }
      reject(CANCELED);
    } 
    cancellationToken.add(abort);
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
    start(token);
  });
}