import { Effect } from "postprocessing";
import { Uniform } from "three";

// ── 커스텀 셰이더: 필름 그레인 + 살짝의 색수차(chromatic aberration) ──────────────
// @react-three/postprocessing이 기본 제공하는 Bloom/Vignette 등과 달리, 이건 직접 짠 GLSL
// 프래그먼트 셰이더입니다. postprocessing 라이브러리의 Effect 베이스 클래스를 상속해서
// mainImage()만 구현하면 EffectComposer 파이프라인에 그대로 꽂을 수 있습니다.
//
// 효과 내용:
//  1) 아주 미세한 흑백 노이즈(그레인)를 얹어서 화면이 너무 매끈한 CG 느낌 대신
//     살짝 필름/아날로그 질감을 갖게 함
//  2) 화면 중심에서 멀어질수록(가장자리) R/B 채널을 반대 방향으로 아주 살짝 어긋나게 샘플링해서
//     렌즈를 통과한 듯한 미세한 색수차를 줌 — Vignette와 궁합이 좋음
// 둘 다 강도를 낮게 잡아서(uGrainIntensity, uAberrationStrength) 티가 나기보다는
// "왠지 화면이 더 고급스럽다" 정도로만 느껴지게 튜닝했습니다.
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uGrainIntensity;
  uniform float uAberrationStrength;

  // 시간에 따라 값이 계속 바뀌는 값싼 의사 난수 — 텍스처 샘플링 없이 GPU에서 바로 계산
  float random(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 화면 중심으로부터의 거리 (0 = 중앙, 가장자리로 갈수록 커짐)
    vec2 centered = uv - 0.5;
    float dist = length(centered);

    // 색수차: 중심에서 멀수록 R/B를 반대 방향으로 살짝 밀어서 샘플링
    vec2 aberrationOffset = centered * dist * uAberrationStrength;
    float r = texture2D(inputBuffer, uv - aberrationOffset).r;
    float g = inputColor.g;
    float b = texture2D(inputBuffer, uv + aberrationOffset).b;

    // 필름 그레인: 프레임마다 바뀌는 미세한 흑백 노이즈를 더하거나 뺌
    float grain = (random(uv * uTime) - 0.5) * uGrainIntensity;

    outputColor = vec4(r + grain, g + grain, b + grain, inputColor.a);
  }
`;

export class FilmGrainEffect extends Effect {
  constructor({ grainIntensity = 0.035, aberrationStrength = 0.0025 } = {}) {
    super("FilmGrainEffect", fragmentShader, {
      uniforms: new Map([
        ["uTime", new Uniform(0)],
        ["uGrainIntensity", new Uniform(grainIntensity)],
        ["uAberrationStrength", new Uniform(aberrationStrength)],
      ]),
    });
  }

  update(_renderer, _inputBuffer, deltaTime) {
    // 매 프레임 시간을 흘려보내야 random()에 쓰이는 시드가 계속 바뀌어서
    // 노이즈가 반짝이는 애니메이션처럼 보입니다 (고정해두면 정적인 얼룩처럼 보임).
    this.uniforms.get("uTime").value += deltaTime;
  }
}
