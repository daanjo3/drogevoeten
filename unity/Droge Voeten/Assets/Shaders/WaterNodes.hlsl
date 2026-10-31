#include "ShaderApiReflectionSupport.hlsl"

// Shader Graph nodes for the Water shader graph: an animated color map (e.g. caustics) and normal map on the surface.
// They appear in the node search under "Droge Voeten/Water".
//
// Both sample their texture twice, scrolling in two different directions, so the pattern changes instead of sliding.
// UVs come from the world X/Z position, so every water plane shows the pattern at the same scale.

// UVs of the two layers: world X/Z times Tiling (repeats per meter), scrolled by Scroll (UV per second); the second
// layer is slightly larger, rotated and moves the other way
void WaterDetailUVs(float3 WorldPosition, float Tiling, float2 Scroll, out float2 uv1, out float2 uv2)
{
    float2 uv = WorldPosition.xz * Tiling;
    float t = _Time.y;
    uv1 = uv + Scroll * t;
    uv2 = float2(uv.y, -uv.x) * 1.13 + float2(-Scroll.y, Scroll.x) * 0.8 * t + 0.37;
}

/// <funchints>
///     <sg:ProviderKey>DrogeVoeten.Water.DetailColor</sg:ProviderKey>
///     <sg:DisplayName>Water Detail Color</sg:DisplayName>
///     <sg:ReturnDisplayName>Color</sg:ReturnDisplayName>
///     <sg:SearchCategory>Droge Voeten/Water</sg:SearchCategory>
///     <sg:SearchTerms>water, caustics, detail, color, animated, scroll</sg:SearchTerms>
/// </funchints>
/// <paramhints name="ColorMap">
///     <sg:DisplayName>Color Map</sg:DisplayName>
/// </paramhints>
/// <paramhints name="WorldPosition">
///     <sg:DisplayName>World Position</sg:DisplayName>
///     <Position/>
///     <Default>AbsoluteWorld</Default>
/// </paramhints>
/// <paramhints name="Tiling">
///     <sg:DisplayName>Tiling (per m)</sg:DisplayName>
///     <sg:Default>0.5</sg:Default>
/// </paramhints>
/// <paramhints name="Scroll">
///     <sg:DisplayName>Scroll (UV per s)</sg:DisplayName>
///     <sg:Default>0.03,0.02</sg:Default>
/// </paramhints>
/// <paramhints name="Strength">
///     <sg:DisplayName>Strength</sg:DisplayName>
///     <sg:Default>0.5</sg:Default>
/// </paramhints>
/// <paramhints name="BaseColor">
///     <sg:DisplayName>Base Color</sg:DisplayName>
/// </paramhints>
/// <summary>
/// Adds an animated color map on top of BaseColor, as light. The two layers are combined with min, which turns two
/// scrolling caustic patterns into shifting bright lines. A black map adds nothing.
/// </summary>
UNITY_EXPORT_REFLECTION float3 WaterDetailColor(UnityTexture2D ColorMap, float3 WorldPosition, float Tiling, float2 Scroll, float Strength, float3 BaseColor)
{
    float2 uv1, uv2;
    WaterDetailUVs(WorldPosition, Tiling, Scroll, uv1, uv2);
    float3 a = ColorMap.Sample(ColorMap.samplerstate, uv1).rgb;
    float3 b = ColorMap.Sample(ColorMap.samplerstate, uv2).rgb;
    return BaseColor + min(a, b) * Strength;
}

/// <funchints>
///     <sg:ProviderKey>DrogeVoeten.Water.DetailNormal</sg:ProviderKey>
///     <sg:DisplayName>Water Detail Normal</sg:DisplayName>
///     <sg:ReturnDisplayName>Normal</sg:ReturnDisplayName>
///     <sg:SearchCategory>Droge Voeten/Water</sg:SearchCategory>
///     <sg:SearchTerms>water, ripples, detail, normal, animated, scroll</sg:SearchTerms>
/// </funchints>
/// <paramhints name="NormalMap">
///     <sg:DisplayName>Normal Map</sg:DisplayName>
/// </paramhints>
/// <paramhints name="WorldPosition">
///     <sg:DisplayName>World Position</sg:DisplayName>
///     <Position/>
///     <Default>AbsoluteWorld</Default>
/// </paramhints>
/// <paramhints name="Tiling">
///     <sg:DisplayName>Tiling (per m)</sg:DisplayName>
///     <sg:Default>0.5</sg:Default>
/// </paramhints>
/// <paramhints name="Scroll">
///     <sg:DisplayName>Scroll (UV per s)</sg:DisplayName>
///     <sg:Default>0.03,0.02</sg:Default>
/// </paramhints>
/// <paramhints name="Strength">
///     <sg:DisplayName>Strength</sg:DisplayName>
///     <sg:Default>1</sg:Default>
/// </paramhints>
/// <paramhints name="BaseNormal">
///     <sg:DisplayName>Base Normal</sg:DisplayName>
///     <sg:Default>0,0,1</sg:Default>
/// </paramhints>
/// <summary>
/// Blends an animated tangent-space normal map into BaseNormal (also tangent space). The two layers' bumps add up;
/// Strength scales them. A flat map ("bump" default) leaves BaseNormal unchanged.
/// </summary>
UNITY_EXPORT_REFLECTION float3 WaterDetailNormal(UnityTexture2D NormalMap, float3 WorldPosition, float Tiling, float2 Scroll, float Strength, float3 BaseNormal)
{
    float2 uv1, uv2;
    WaterDetailUVs(WorldPosition, Tiling, Scroll, uv1, uv2);
    float3 a = UnpackNormal(NormalMap.Sample(NormalMap.samplerstate, uv1));
    float3 b = UnpackNormal(NormalMap.Sample(NormalMap.samplerstate, uv2));
    // The second layer's UVs are rotated 90 degrees (u = y, v = -x), so rotate its slopes back to the surface's frame
    float2 detail = (a.xy + float2(-b.y, b.x)) * Strength;

    // Whiteout blend: add the slopes, multiply the up components
    return normalize(float3(BaseNormal.xy + detail, BaseNormal.z * a.z * b.z));
}
