#include "ShaderApiReflectionSupport.hlsl"

// Shader Graph nodes for the underwater full-screen effect (Underwater.shadergraph).
// They appear in the node search under "Droge Voeten/Underwater".

/// <funchints>
///     <sg:ProviderKey>DrogeVoeten.Underwater.WavyDistortion</sg:ProviderKey>
///     <sg:DisplayName>Underwater Wavy Distortion</sg:DisplayName>
///     <sg:ReturnDisplayName>UV</sg:ReturnDisplayName>
///     <sg:SearchCategory>Droge Voeten/Underwater</sg:SearchCategory>
///     <sg:SearchTerms>underwater, distortion, wobble, wave, refraction, uv</sg:SearchTerms>
/// </funchints>
/// <paramhints name="ScreenPosition">
///     <ScreenPosition/>
///     <Default>Default</Default>
/// </paramhints>
/// <paramhints name="Amount">
///     <sg:DisplayName>Amount</sg:DisplayName>
///     <sg:Default>1</sg:Default>
/// </paramhints>
/// <paramhints name="Strength">
///     <sg:DisplayName>Strength</sg:DisplayName>
///     <sg:Default>0.004</sg:Default>
/// </paramhints>
/// <paramhints name="Scale">
///     <sg:DisplayName>Scale</sg:DisplayName>
///     <sg:Default>12</sg:Default>
/// </paramhints>
/// <paramhints name="Speed">
///     <sg:DisplayName>Speed</sg:DisplayName>
///     <sg:Default>1</sg:Default>
/// </paramhints>
/// <summary>
/// Screen UV that wobbles slowly, for sampling the scene as if through moving water.
/// Strength is the largest offset in UV units, Scale the number of waves across the screen, Amount (0..1) fades it in.
/// </summary>
UNITY_EXPORT_REFLECTION float2 UnderwaterWavyDistortion(float4 ScreenPosition, float Amount, float Strength, float Scale, float Speed)
{
    float2 uv = ScreenPosition.xy;
    float t = _Time.y * Speed;

    // Two sine layers per axis at unrelated frequencies, so the pattern doesn't visibly repeat
    float2 offset;
    offset.x = sin(uv.y * Scale + t) + 0.5 * sin(uv.y * Scale * 2.3 + uv.x * 3.0 - t * 1.7);
    offset.y = cos(uv.x * Scale * 0.8 + t * 1.3) + 0.5 * cos(uv.x * Scale * 1.9 + uv.y * 2.0 + t * 0.9);

    // The sum of both layers stays within [-1.5, 1.5]
    return uv + offset * (Amount * Strength / 1.5);
}

/// <funchints>
///     <sg:ProviderKey>DrogeVoeten.Underwater.AbsorptionFog</sg:ProviderKey>
///     <sg:DisplayName>Underwater Absorption Fog</sg:DisplayName>
///     <sg:ReturnDisplayName>Color</sg:ReturnDisplayName>
///     <sg:SearchCategory>Droge Voeten/Underwater</sg:SearchCategory>
///     <sg:SearchTerms>underwater, fog, absorption, depth, water color, murky</sg:SearchTerms>
/// </funchints>
/// <paramhints name="SceneColor">
///     <sg:DisplayName>Scene Color</sg:DisplayName>
/// </paramhints>
/// <paramhints name="Distance">
///     <sg:DisplayName>Distance</sg:DisplayName>
/// </paramhints>
/// <paramhints name="WaterColor">
///     <sg:DisplayName>Water Color</sg:DisplayName>
///     <sg:Color />
///     <sg:Default>0.02,0.12,0.14</sg:Default>
/// </paramhints>
/// <paramhints name="Extinction">
///     <sg:DisplayName>Extinction (RGB per m)</sg:DisplayName>
///     <sg:Default>0.45,0.18,0.12</sg:Default>
/// </paramhints>
/// <paramhints name="Density">
///     <sg:DisplayName>Density</sg:DisplayName>
///     <sg:Default>1</sg:Default>
/// </paramhints>
/// <summary>
/// Light from the scene fades with distance through the water, red fastest, and the water's own color takes its place.
/// Distance is in meters (eye depth); Extinction is how much of each channel is lost per meter, scaled by Density.
/// </summary>
UNITY_EXPORT_REFLECTION float3 UnderwaterAbsorptionFog(float3 SceneColor, float Distance, float3 WaterColor, float3 Extinction, float Density)
{
    float3 transmittance = exp(-Extinction * Density * max(Distance, 0.0));
    return SceneColor * transmittance + WaterColor * (1.0 - transmittance);
}
