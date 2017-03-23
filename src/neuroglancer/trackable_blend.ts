import {TrackableValue} from 'neuroglancer/trackable_value';
import {verifyEnumString} from 'neuroglancer/util/json';
import {GL} from 'neuroglancer/webgl/context';

export enum BLEND_MODES {
    DEFAULT = 0,
    ADDITIVE = 1,
}

export const BLEND_FUNCTIONS = new Map<number,Function>();
BLEND_FUNCTIONS.set(BLEND_MODES.DEFAULT, (gl: GL) => { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); });
BLEND_FUNCTIONS.set(BLEND_MODES.ADDITIVE, (gl: GL) => { gl.blendFunc(gl.SRC_ALPHA, gl.ONE); });

export type TrackableBlendValue = TrackableValue<number>;

export function trackableBlendValue(initialValue = BLEND_MODES.DEFAULT) {
    return new TrackableValue<number>(initialValue, (value) => {return verifyEnumString(value, BLEND_MODES)});
}