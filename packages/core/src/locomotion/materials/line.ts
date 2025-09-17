/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Color,
  ShaderLib,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from '../../runtime/three.js';

// @ts-ignore
UniformsLib.linee = {
  linewidth: { value: 1 },
  color: { value: new Color(0xffffff) },
  startPoint: { value: new Vector3() },
  endPoint: { value: new Vector3() },
};

ShaderLib['linee'] = {
  uniforms: UniformsUtils.merge([
    UniformsLib.common,
    UniformsLib.fog,
    // @ts-ignore
    UniformsLib.linee,
  ]),

  vertexShader: /* glsl */ `
		#include <common>
		#include <color_pars_vertex>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>
		#include <clipping_planes_pars_vertex>

		uniform float linewidth;
		uniform vec3 startPoint;
		uniform vec3 endPoint;
		varying float vDistanceAlpha;

		attribute vec3 instanceStart;
		attribute vec3 instanceEnd;

		attribute vec3 instanceColorStart;
		attribute vec3 instanceColorEnd;

		varying vec4 worldPos;
		varying vec3 worldStart;
		varying vec3 worldEnd;

		void trimSegment( const in vec4 start, inout vec4 end ) {

			// trim end segment so it terminates between the camera plane and the near plane

			// conservative estimate of the near plane
			float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
			float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
			float nearEstimate = - 0.5 * b / a;

			float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

			end.xyz = mix( start.xyz, end.xyz, alpha );

		}

		void main() {

			#ifdef USE_COLOR

				vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

			#endif

			// camera space
			vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );


			worldStart = start.xyz;
			worldEnd = end.xyz;

			vec3 currentPosition = (position.y < 0.5) ? instanceStart : instanceEnd;
    	float distanceToStart = length(currentPosition - startPoint);
			float startAlpha = smoothstep(0.0, 0.8, distanceToStart);
    	float distanceToEnd = length(currentPosition - endPoint);
			float endAlpha = smoothstep(0.5, 2.0, distanceToEnd);
    	// Compute vDistanceAlpha using smoothstep
    	vDistanceAlpha = min(startAlpha, endAlpha);
			

			// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
			// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
			// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
			// perhaps there is a more elegant solution -- WestLangley

			bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

			if ( perspective ) {

				if ( start.z < 0.0 && end.z >= 0.0 ) {

					trimSegment( start, end );

				} else if ( end.z < 0.0 && start.z >= 0.0 ) {

					trimSegment( end, start );

				}

			}

			// clip space
			vec4 clipStart = projectionMatrix * start;
			vec4 clipEnd = projectionMatrix * end;

			// ndc space
			vec3 ndcStart = clipStart.xyz / clipStart.w;
			vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

			// direction
			vec2 dir = ndcEnd.xy - ndcStart.xy;
			dir = normalize( dir );

			vec3 worldDir = normalize( end.xyz - start.xyz );
			vec3 tmpFwd = normalize( mix( start.xyz, end.xyz, 0.5 ) );
			vec3 worldUp = normalize( cross( worldDir, tmpFwd ) );
			vec3 worldFwd = cross( worldDir, worldUp );
			worldPos = position.y < 0.5 ? start: end;

			// height offset
			float hw = linewidth * 0.5;
			worldPos.xyz += position.x < 0.0 ? hw * worldUp : - hw * worldUp;

			// don't extend the line if we're rendering dashes because we
			// won't be rendering the endcaps

			// cap extension
			worldPos.xyz += position.y < 0.5 ? - hw * worldDir : hw * worldDir;

			// add width to the box
			worldPos.xyz += worldFwd * hw;

			// endcaps
			if ( position.y > 1.0 || position.y < 0.0 ) {

				worldPos.xyz -= worldFwd * 2.0 * hw;

			}


			// project the worldpos
			vec4 clip = projectionMatrix * worldPos;

			// shift the depth of the projected points so the line
			// segments overlap neatly
			vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
			clip.z = clipPose.z * clip.w;

			gl_Position = clip;

			vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

			#include <logdepthbuf_vertex>
			#include <clipping_planes_vertex>
			#include <fog_vertex>

		}
		`,

  fragmentShader: /* glsl */ `
		uniform float linewidth;

		varying vec4 worldPos;
		varying vec3 worldStart;
		varying vec3 worldEnd;
		varying float vDistanceAlpha;

		#include <common>
		#include <color_pars_fragment>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>
		#include <clipping_planes_pars_fragment>

		vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

			float mua;
			float mub;

			vec3 p13 = p1 - p3;
			vec3 p43 = p4 - p3;

			vec3 p21 = p2 - p1;

			float d1343 = dot( p13, p43 );
			float d4321 = dot( p43, p21 );
			float d1321 = dot( p13, p21 );
			float d4343 = dot( p43, p43 );
			float d2121 = dot( p21, p21 );

			float denom = d2121 * d4343 - d4321 * d4321;

			float numer = d1343 * d4321 - d1321 * d4343;

			mua = numer / denom;
			mua = clamp( mua, 0.0, 1.0 );
			mub = ( d1343 + d4321 * ( mua ) ) / d4343;
			mub = clamp( mub, 0.0, 1.0 );

			return vec2( mua, mub );

		}

		void main() {

			#include <clipping_planes_fragment>

			// Find the closest points on the view ray and the line segment
			vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
			vec3 lineDir = worldEnd - worldStart;
			vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

			vec3 p1 = worldStart + lineDir * params.x;
			vec3 p2 = rayEnd * params.y;
			vec3 delta = p1 - p2;
			float len = length( delta );
			float norm = len / linewidth;

			if ( norm > 0.5 ) {
				discard;
			}

			#include <logdepthbuf_fragment>

			gl_FragColor = vec4( 1.0, 1.0, 1.0, vDistanceAlpha );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			#include <fog_fragment>
			#include <premultiplied_alpha_fragment>

		}
		`,
};

class LineMaterial extends ShaderMaterial {
  isLineMaterial = true;
  // Compatibility flags with three/examples LineMaterial API
  // worldUnits is effectively always true in this shader, but we accept the flag to avoid warnings
  private _worldUnits: boolean = true;
  constructor(parameters: any) {
    super({
      // @ts-ignore
      type: 'LineMaterial',
      uniforms: UniformsUtils.clone(ShaderLib['linee'].uniforms),

      vertexShader: ShaderLib['linee'].vertexShader,
      fragmentShader: ShaderLib['linee'].fragmentShader,

      clipping: true, // required for clipping support
    });

    this.setValues(parameters);
  }

  get color() {
    return this.uniforms.diffuse.value;
  }

  set color(value) {
    this.uniforms.diffuse.value = value;
  }

  // @ts-ignore
  get linewidth() {
    return this.uniforms.linewidth.value;
  }

  // @ts-ignore
  set linewidth(value) {
    if (!this.uniforms.linewidth) {
      return;
    }
    this.uniforms.linewidth.value = value;
  }

  get dashed() {
    return 'USE_DASH' in this.defines;
  }

  set dashed(value) {
    if ((value === true) !== this.dashed) {
      this.needsUpdate = true;
    }

    if (value === true) {
      this.defines.USE_DASH = '';
    } else {
      delete this.defines.USE_DASH;
    }
  }

  // @ts-ignore
  get opacity() {
    return this.uniforms.opacity.value;
  }

  set opacity(value) {
    if (!this.uniforms) {
      return;
    }
    this.uniforms.opacity.value = value;
  }

  // --- Compatibility API ---
  // Accept and expose `worldUnits` so Material.setValues doesn't warn.
  // Our implementation measures linewidth in world space, so this is a no-op.
  get worldUnits(): boolean {
    return this._worldUnits;
  }
  set worldUnits(v: boolean) {
    this._worldUnits = !!v;
  }

  // Note: `vertexColors` is a property on ShaderMaterial; we rely on three's behavior.
}

export { LineMaterial };
