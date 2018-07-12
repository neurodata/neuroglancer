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

import {UserLayer} from 'neuroglancer/layer';
import {LayerListSpecification, registerLayerType, registerVolumeLayerType} from 'neuroglancer/layer_specification';
import {Overlay} from 'neuroglancer/overlay';
import {VolumeType} from 'neuroglancer/sliceview/volume/base';
import {FRAGMENT_MAIN_START, getTrackableFragmentMain, ImageRenderLayer} from 'neuroglancer/sliceview/volume/image_renderlayer';
import {trackableAlphaValue} from 'neuroglancer/trackable_alpha';
import {trackableBlendModeValue} from 'neuroglancer/trackable_blend';
import {UserLayerWithVolumeSourceMixin} from 'neuroglancer/user_layer_with_volume_source';
import {makeWatchableShaderError} from 'neuroglancer/webgl/dynamic_shader';
import {RangeWidget} from 'neuroglancer/widget/range';
import {ShaderCodeWidget} from 'neuroglancer/widget/shader_code_widget';
import {Tab} from 'neuroglancer/widget/tab_view';
import {TrackableValue} from 'neuroglancer/trackable_value';
import { verifyFloat, parseArray } from 'neuroglancer/util/json';

require('./image_user_layer.css');
require('neuroglancer/maximize_button.css');

const OPACITY_JSON_KEY = 'opacity';
const BLEND_JSON_KEY = 'blend';
const SHADER_JSON_KEY = 'shader';
const UNIFORM_WIDGET_JSON_KEY = 'uniforms';

enum ShaderUniformTypes {
  Float
}

interface ShaderUniformSpecification {
  name: string;
  type: ShaderUniformTypes;
  value: any;
}

type ShaderUniformMap = Map<string, TrackableValue<number>>;

// TODO(adb): can we template this based on the type enum?
export class ShaderUniformWidget<T> implements ShaderUniformSpecification {
  name: string;
  type: ShaderUniformTypes;
  value: any;

  trackableValue: TrackableValue<T>;
  constructor(_name: string, _type: ShaderUniformTypes, _initialValue: any) {

  }
}

class ShaderUniformWidgets {
  uniforms: ShaderUniformMap = new Map<string, TrackableValue<number>>();

  constructor() {
    this.uniforms.set('test', new TrackableValue<number>(0.5, verifyFloat));
    console.log('getting test');
    let t = this.uniforms.get('test')!;
    console.log(t);
    t.value = 0.1;
  }

  restoreState(specification: any) {
    if (specification) {
      parseArray(specification, (x) => {
        console.log(x);
      });
    }
  }

  toJSON() {
    let values: any = [];
    this.uniforms.forEach((value, name) => {
      console.log(name);
      values.push({ 'name': name, 'type': 'float', 'value': value.toJSON() });
    });
    console.log(values);
    return values;
  }

}

const Base = UserLayerWithVolumeSourceMixin(UserLayer);
export class ImageUserLayer extends Base {
  opacity = trackableAlphaValue(0.5);
  blendMode = trackableBlendModeValue();
  fragmentMain = getTrackableFragmentMain();
  shaderError = makeWatchableShaderError();
  shaderUniformWidgets: ShaderUniformWidgets = new ShaderUniformWidgets();
  renderLayer: ImageRenderLayer;
  constructor(manager: LayerListSpecification, x: any) {
    super(manager, x);

    console.log(this.shaderUniformWidgets);

    this.registerDisposer(this.fragmentMain.changed.add(this.specificationChanged.dispatch));
    this.tabs.add(
        'rendering',
        {label: 'Rendering', order: -100, getter: () => new RenderingOptionsTab(this)});
    this.tabs.default = 'rendering';
  }

  restoreState(specification: any) {
    super.restoreState(specification);
    this.opacity.restoreState(specification[OPACITY_JSON_KEY]);
    this.blendMode.restoreState(specification[BLEND_JSON_KEY]);
    this.fragmentMain.restoreState(specification[SHADER_JSON_KEY]);
    this.shaderUniformWidgets.restoreState(specification[UNIFORM_WIDGET_JSON_KEY]);
    const {multiscaleSource} = this;
    if (multiscaleSource === undefined) {
      throw new Error(`source property must be specified`);
    }
    multiscaleSource.then(volume => {
      if (!this.wasDisposed) {
        let renderLayer = this.renderLayer = new ImageRenderLayer(volume, {
          opacity: this.opacity,
          blendMode: this.blendMode,
          fragmentMain: this.fragmentMain,
          shaderError: this.shaderError,
          transform: this.transform,
        });
        this.addRenderLayer(renderLayer);
        this.shaderError.changed.dispatch();
        this.isReady = true;
      }
    });
  }
  toJSON() {
    const x = super.toJSON();
    x['type'] = 'image';
    x[OPACITY_JSON_KEY] = this.opacity.toJSON();
    x[BLEND_JSON_KEY] = this.blendMode.toJSON();
    x[SHADER_JSON_KEY] = this.fragmentMain.toJSON();
    x[UNIFORM_WIDGET_JSON_KEY] = this.shaderUniformWidgets.toJSON();
    return x;
  }
}

function makeShaderCodeWidget(layer: ImageUserLayer) {
  return new ShaderCodeWidget({
    shaderError: layer.shaderError,
    fragmentMain: layer.fragmentMain,
    fragmentMainStartLine: FRAGMENT_MAIN_START,
  });
}

class RenderingOptionsTab extends Tab {
  opacityWidget = this.registerDisposer(new RangeWidget(this.layer.opacity));
  codeWidget = this.registerDisposer(makeShaderCodeWidget(this.layer));
  constructor(public layer: ImageUserLayer) {
    super();
    const {element} = this;
    element.classList.add('image-dropdown');
    let {opacityWidget} = this;
    let topRow = document.createElement('div');
    topRow.className = 'image-dropdown-top-row';
    opacityWidget.promptElement.textContent = 'Opacity';

    let spacer = document.createElement('div');
    spacer.style.flex = '1';
    let helpLink = document.createElement('a');
    let helpButton = document.createElement('button');
    helpButton.type = 'button';
    helpButton.textContent = '?';
    helpButton.className = 'help-link';
    helpLink.appendChild(helpButton);
    helpLink.title = 'Documentation on image layer rendering';
    helpLink.target = '_blank';
    helpLink.href =
        'https://github.com/google/neuroglancer/blob/master/src/neuroglancer/sliceview/image_layer_rendering.md';

    let maximizeButton = document.createElement('button');
    maximizeButton.innerHTML = '&square;';
    maximizeButton.className = 'maximize-button';
    maximizeButton.title = 'Show larger editor view';
    this.registerEventListener(maximizeButton, 'click', () => {
      new ShaderCodeOverlay(this.layer);
    });

    topRow.appendChild(this.opacityWidget.element);
    topRow.appendChild(spacer);
    topRow.appendChild(maximizeButton);
    topRow.appendChild(helpLink);

    element.appendChild(topRow);
    element.appendChild(this.codeWidget.element);
    
    // TODO(adb): expose adding of shader widgets with UI controls
    let testWidget = document.createElement('div');
    testWidget.textContent = 'Shader Widget';
    element.appendChild(testWidget);
    this.codeWidget.textEditor.refresh();
    this.visibility.changed.add(() => {
      if (this.visible) {
        this.codeWidget.textEditor.refresh();
      }
    });
  }
}

class ShaderCodeOverlay extends Overlay {
  codeWidget = this.registerDisposer(makeShaderCodeWidget(this.layer));
  constructor(public layer: ImageUserLayer) {
    super();
    this.content.classList.add('image-layer-shader-overlay');
    this.content.appendChild(this.codeWidget.element);
    this.codeWidget.textEditor.refresh();
  }
}

registerLayerType('image', ImageUserLayer);
registerVolumeLayerType(VolumeType.IMAGE, ImageUserLayer);
