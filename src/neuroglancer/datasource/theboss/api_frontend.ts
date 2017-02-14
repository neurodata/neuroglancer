/**
 * @license
 * Copyright 2017 Neurodata.
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

import {StatusMessage} from 'neuroglancer/status';
import {Token} from 'neuroglancer/datasource/theboss/api';

export class Implementation { getNewTokenPromise: () => Promise<Token>; }
export var implementation = new Implementation();

let promise: Promise<Token>|null = null;
let token: Token|null = null;

const status = new StatusMessage(/*delay=*/true);

implementation.getNewTokenPromise = function() {
  return new Promise<string>((resolve, reject) => {
    let retries = 3; 
    function writeLoginStatus(msg = 'Waiting for The Boss authorization.', linkMessage = 'Retry') {
        status.setText(msg + '  ');
        let button = document.createElement('button');
        button.textContent = linkMessage; 
        status.element.appendChild(button);
        button.addEventListener('click', () => {
            start();
        });
        status.setVisible(true);
    }
    function start() {
      let token = getTokenFromWindow(); 
      if (token === undefined) {
        writeLoginStatus('Waiting for The Boss authoriazation...', 'Retry');
        retries--;
        if (retries < 0) {
          reject(token);
        }
      } else {
        status.dispose();
        resolve(token); 
      }
    }
    // start();
    // Try three times, then let the user try 
    setTimeout(start, 30); 
    setTimeout(start, 150); 
    setTimeout(start, 250);
    // setTimeout(start, 500);
  });
}

export function getToken() {
    if (promise !== null && token === null) {
        // Either we have a token or are obtaining one
        return promise; 
    }
    token = null; 
    promise = implementation.getNewTokenPromise();
    promise.then((t: Token) => { token = t; });
    return promise;
}

function getTokenFromWindow(): Token|undefined {
    return (<any>window).keycloak.token; 
}