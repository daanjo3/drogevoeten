using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

// Volume override for the underwater full-screen effect (Assets/Shaders/Underwater.shadergraph).
// UnderwaterRendererFeature draws the effect whenever the blended intensity is above 0 and passes it to the shader
// as _Intensity. The default is 0, so the effect is off unless a volume overrides it.
[VolumeComponentMenu("Post-processing Custom/Underwater")]
[VolumeRequiresRendererFeatures(typeof(UnderwaterRendererFeature))]
[SupportedOnRenderPipeline(typeof(UniversalRenderPipelineAsset))]
[DisplayInfo(name = "Underwater")]
public sealed class UnderwaterEffect : VolumeComponent, IPostProcessComponent
{
    [Tooltip("Strength of the underwater effect. Multiplied by the volume weight.")]
    public ClampedFloatParameter intensity = new ClampedFloatParameter(0f, 0f, 1f);

    public bool IsActive()
    {
        return intensity.value > 0f;
    }
}
