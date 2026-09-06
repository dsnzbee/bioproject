import { commonGLSL } from "./common";

export const FULLSCREEN_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// semi-Lagrangian advection: trace each cell backward along the current
// velocity and sample the field there (unconditionally stable, the whole
// reason this family of solvers doesn't need a CFL-limited timestep)
export function advectFrag(layout) {
  return commonGLSL(layout) + `
    uniform sampler2D velocityTex;
    uniform sampler2D sourceTex;
    uniform float dt;
    uniform vec3 invCellSize;

    void main() {
      vec3 cell = cellFromFragCoord(gl_FragCoord.xy);
      vec3 vel = texture2D(velocityTex, atlasUV(cell)).xyz;
      vec3 backCell = cell - dt * vel * invCellSize;
      gl_FragColor = sampleAtlas(sourceTex, backCell);
    }
  `;
}

export function divergenceFrag(layout) {
  return commonGLSL(layout) + `
    uniform sampler2D velocityTex;
    uniform vec3 invCellSize;

    void main() {
      vec3 cell = cellFromFragCoord(gl_FragCoord.xy);
      vec3 vL = texture2D(velocityTex, atlasUV(cell + vec3(-1.0, 0.0, 0.0))).xyz;
      vec3 vR = texture2D(velocityTex, atlasUV(cell + vec3(1.0, 0.0, 0.0))).xyz;
      vec3 vD = texture2D(velocityTex, atlasUV(cell + vec3(0.0, -1.0, 0.0))).xyz;
      vec3 vU = texture2D(velocityTex, atlasUV(cell + vec3(0.0, 1.0, 0.0))).xyz;
      vec3 vB = texture2D(velocityTex, atlasUV(cell + vec3(0.0, 0.0, -1.0))).xyz;
      vec3 vF = texture2D(velocityTex, atlasUV(cell + vec3(0.0, 0.0, 1.0))).xyz;
      float div =
        0.5 * (vR.x - vL.x) * invCellSize.x +
        0.5 * (vU.y - vD.y) * invCellSize.y +
        0.5 * (vF.z - vB.z) * invCellSize.z;
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `;
}

// one Jacobi relaxation step toward solving the pressure Poisson equation
// nabla^2 p = div, on a (possibly non-cubic) grid
export function jacobiFrag(layout) {
  return commonGLSL(layout) + `
    uniform sampler2D pressureTex;
    uniform sampler2D divergenceTex;
    uniform vec3 invCellSize2; // 1/dx^2, 1/dy^2, 1/dz^2

    void main() {
      vec3 cell = cellFromFragCoord(gl_FragCoord.xy);
      float pL = texture2D(pressureTex, atlasUV(cell + vec3(-1.0, 0.0, 0.0))).r;
      float pR = texture2D(pressureTex, atlasUV(cell + vec3(1.0, 0.0, 0.0))).r;
      float pD = texture2D(pressureTex, atlasUV(cell + vec3(0.0, -1.0, 0.0))).r;
      float pU = texture2D(pressureTex, atlasUV(cell + vec3(0.0, 1.0, 0.0))).r;
      float pB = texture2D(pressureTex, atlasUV(cell + vec3(0.0, 0.0, -1.0))).r;
      float pF = texture2D(pressureTex, atlasUV(cell + vec3(0.0, 0.0, 1.0))).r;
      float div = texture2D(divergenceTex, atlasUV(cell)).r;
      float denom = 2.0 * (invCellSize2.x + invCellSize2.y + invCellSize2.z);
      float p = ((pL + pR) * invCellSize2.x + (pD + pU) * invCellSize2.y + (pB + pF) * invCellSize2.z - div) / denom;
      gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
    }
  `;
}

// subtract the pressure gradient so the velocity field becomes divergence-free
export function projectFrag(layout) {
  return commonGLSL(layout) + `
    uniform sampler2D velocityTex;
    uniform sampler2D pressureTex;
    uniform vec3 invCellSize2x; // 1/(2dx), 1/(2dy), 1/(2dz)

    void main() {
      vec3 cell = cellFromFragCoord(gl_FragCoord.xy);
      float pL = texture2D(pressureTex, atlasUV(cell + vec3(-1.0, 0.0, 0.0))).r;
      float pR = texture2D(pressureTex, atlasUV(cell + vec3(1.0, 0.0, 0.0))).r;
      float pD = texture2D(pressureTex, atlasUV(cell + vec3(0.0, -1.0, 0.0))).r;
      float pU = texture2D(pressureTex, atlasUV(cell + vec3(0.0, 1.0, 0.0))).r;
      float pB = texture2D(pressureTex, atlasUV(cell + vec3(0.0, 0.0, -1.0))).r;
      float pF = texture2D(pressureTex, atlasUV(cell + vec3(0.0, 0.0, 1.0))).r;
      vec3 grad = vec3((pR - pL) * invCellSize2x.x, (pU - pD) * invCellSize2x.y, (pF - pB) * invCellSize2x.z);
      vec3 vel = texture2D(velocityTex, atlasUV(cell)).xyz;
      gl_FragColor = vec4(vel - grad, 1.0);
    }
  `;
}

// atmospheric-boundary-layer inlet (power-law shear + cheap synthetic
// turbulence), no-slip ground, immersed-boundary obstacle; east/top/side
// faces are intentionally left untouched (pass-through), which is exactly a
// zero-gradient / convective-outflow condition
export function boundaryFrag(layout) {
  return commonGLSL(layout) + `
    uniform sampler2D velocityTex;
    uniform sampler2D obstacleTex;
    uniform float time;
    uniform float uRef;
    uniform vec2 inflowDir; // unit vector in the X-Z plane
    uniform float refHeightCells;
    uniform float shearExponent;
    uniform float turbulenceIntensity;

    float hash(vec3 p) {
      return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    }

    void main() {
      vec3 cell = cellFromFragCoord(gl_FragCoord.xy);
      vec4 vel = texture2D(velocityTex, atlasUV(cell));
      float solid = texture2D(obstacleTex, atlasUV(cell)).r;

      if (cell.x < 1.0) {
        float heightFrac = max(cell.y, 0.5) / max(refHeightCells, 1.0);
        float shear = pow(heightFrac, shearExponent);
        float n = hash(cell + vec3(floor(time * 30.0), 0.0, 0.0));
        float turb = (n - 0.5) * 2.0 * turbulenceIntensity;
        float speed = uRef * shear * (1.0 + turb);
        vel = vec4(speed * inflowDir.x, 0.0, speed * inflowDir.y, 1.0);
      }

      if (cell.y < 1.0) {
        vel = vec4(0.0, 0.0, 0.0, 1.0);
      }

      // slip lid: zero the normal (vertical) component at the domain top,
      // let the tangential (streamwise) component pass through freely
      if (cell.y > NY - 1.5) {
        vel.y = 0.0;
      }

      if (solid > 0.5) {
        vel = vec4(0.0, 0.0, 0.0, 1.0);
      }

      gl_FragColor = vel;
    }
  `;
}

// Actuator-disk body force: a *permeable* momentum sink smeared thin in the
// axial direction (Gaussian, ~1-2 cells) and flat-with-soft-edge radially —
// a disk, not a solid sphere. This is what actually produces correct rotor
// physics: it never clamps velocity to zero, so the incompressible pressure
// solve responds to the sink by decelerating the flow smoothly *upstream*
// (the induction zone) and the deficit left in the wake is genuinely
// advected downstream by the next pass, rather than being an immovable
// blockage.
//
// Force magnitude uses the LOCAL sampled velocity, not a fixed reference
// speed: T = 0.5 * rho * A * Ct * u_local^2 => accel = 0.5*Ct*u_local^2/thickness
// (rho cancels). This is the standard actuator-disk formulation and it is
// self-limiting by construction — as u_local drops toward the induced
// value, the force drops with it (quadratically), so the disk relaxes to
// an equilibrium instead of a fixed-Uref version which keeps subtracting
// the same large decrement every step regardless of how slow the flow
// there already is, and runs away to a hard-zero "wall".
export function rotorForceFrag(layout) {
  return commonGLSL(layout) + `
    uniform sampler2D velocityTex;
    uniform vec3 domainOrigin;
    uniform vec3 cellSize;
    uniform vec3 diskCenterWorld[2];
    uniform float diskRadiusWorld;
    uniform float diskThicknessWorld;
    uniform float thrustCoefficient;
    uniform float dt;

    void main() {
      vec3 cell = cellFromFragCoord(gl_FragCoord.xy);
      vec3 worldPos = domainOrigin + cell * cellSize;
      vec3 vel = texture2D(velocityTex, atlasUV(cell)).xyz;
      float uLocal = max(0.0, vel.x);
      float accel = 0.5 * thrustCoefficient * uLocal * uLocal / diskThicknessWorld;

      for (int i = 0; i < 2; i++) {
        vec3 d = worldPos - diskCenterWorld[i];
        float axial = d.x;
        float radial = length(d.yz);
        float axialWeight = exp(-0.5 * (axial * axial) / (diskThicknessWorld * diskThicknessWorld));
        float edgeWeight = 1.0 - smoothstep(diskRadiusWorld * 0.88, diskRadiusWorld * 1.05, radial);
        // spanwise loading shape: zero at the hub (flow there passes the
        // solid nacelle, not a blade) and at the tip (real blades carry
        // ~zero load right at the tip), peaking around mid-span — a
        // physically-motivated stand-in for a real BEM loading
        // distribution's shape, in the absence of one (see
        // cfd/aero/biomimicryToPhysics.js for what IS and isn't modelled)
        float rf = clamp(radial / diskRadiusWorld, 0.0, 1.0);
        float loadShape = sin(3.14159265 * rf);
        float radialWeight = edgeWeight * loadShape;
        vel.x -= accel * axialWeight * radialWeight * dt;
      }

      gl_FragColor = vec4(vel, 1.0);
    }
  `;
}

// explicit turbulent-mixing diffusion of velocity — a real physical
// mechanism (not just numerical smoothing) representing the sub-grid eddy
// mixing that lets a wake actually recover toward freestream over
// downstream distance rather than just decaying in place
export function diffuseFrag(layout) {
  return commonGLSL(layout) + `
    uniform sampler2D velocityTex;
    uniform vec3 invCellSize2;
    uniform float viscosity;
    uniform float dt;

    void main() {
      vec3 cell = cellFromFragCoord(gl_FragCoord.xy);
      vec3 v0 = texture2D(velocityTex, atlasUV(cell)).xyz;
      vec3 vL = texture2D(velocityTex, atlasUV(cell + vec3(-1.0, 0.0, 0.0))).xyz;
      vec3 vR = texture2D(velocityTex, atlasUV(cell + vec3(1.0, 0.0, 0.0))).xyz;
      vec3 vD = texture2D(velocityTex, atlasUV(cell + vec3(0.0, -1.0, 0.0))).xyz;
      vec3 vU = texture2D(velocityTex, atlasUV(cell + vec3(0.0, 1.0, 0.0))).xyz;
      vec3 vB = texture2D(velocityTex, atlasUV(cell + vec3(0.0, 0.0, -1.0))).xyz;
      vec3 vF = texture2D(velocityTex, atlasUV(cell + vec3(0.0, 0.0, 1.0))).xyz;

      vec3 laplacian =
        (vL + vR - 2.0 * v0) * invCellSize2.x +
        (vD + vU - 2.0 * v0) * invCellSize2.y +
        (vB + vF - 2.0 * v0) * invCellSize2.z;

      gl_FragColor = vec4(v0 + viscosity * dt * laplacian, 1.0);
    }
  `;
}

export const CLEAR_FRAG = `
  precision highp float;
  uniform vec4 value;
  void main() { gl_FragColor = value; }
`;
