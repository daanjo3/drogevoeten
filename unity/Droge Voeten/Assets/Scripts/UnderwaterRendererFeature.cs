using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.RenderGraphModule.Util;
using UnityEngine.Rendering.Universal;

// Draws the underwater full-screen material while the UnderwaterEffect volume override is active.
// Based on URP's "Post-process Volume Scripts" template, render graph path only.
// Must be added to every renderer in use: PC_Renderer (editor) and Mobile_Renderer (the web build's quality level).
public sealed class UnderwaterRendererFeature : ScriptableRendererFeature
{
    [Tooltip("Material using a Fullscreen Shader Graph. Gets the blended volume intensity as _Intensity.")]
    [SerializeField]
    private Material material;

    private UnderwaterPass pass;

    public override void Create()
    {
        // Before URP's own post-processing, so the effect works in HDR and gets tonemapped like the rest of the scene
        pass = new UnderwaterPass(name)
        {
            renderPassEvent = RenderPassEvent.BeforeRenderingPostProcessing,
        };
    }

    public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
    {
        if (material == null)
        {
            return;
        }

        CameraType cameraType = renderingData.cameraData.cameraType;
        if (cameraType == CameraType.Preview || cameraType == CameraType.Reflection)
        {
            return;
        }

        UnderwaterEffect effect = VolumeManager.instance.stack?.GetComponent<UnderwaterEffect>();
        if (effect == null || !effect.IsActive())
        {
            return;
        }

        pass.Setup(material, effect.intensity.value);
        renderer.EnqueuePass(pass);
    }

    private sealed class UnderwaterPass : ScriptableRenderPass
    {
        private static readonly int IntensityId = Shader.PropertyToID("_Intensity");

        private readonly MaterialPropertyBlock propertyBlock = new MaterialPropertyBlock();
        private Material material;

        public UnderwaterPass(string passName)
        {
            profilingSampler = new ProfilingSampler(passName);
            // The shader reads the camera color, so URP must render into a texture rather than the backbuffer
            requiresIntermediateTexture = true;
            // The fog reads the scene depth (Scene Depth node)
            ConfigureInput(ScriptableRenderPassInput.Depth);
        }

        public void Setup(Material material, float intensity)
        {
            this.material = material;
            propertyBlock.SetFloat(IntensityId, intensity);
        }

        public override void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData)
        {
            UniversalResourceData resources = frameData.Get<UniversalResourceData>();
            if (!resources.cameraDepthTexture.IsValid())
            {
                return;
            }

            // Blit the camera color through the material into a new texture (bound as _BlitTexture), then make that the camera color
            TextureDesc desc = renderGraph.GetTextureDesc(resources.cameraColor);
            desc.name = "_CameraColorUnderwater";
            desc.clearBuffer = false;
            TextureHandle destination = renderGraph.CreateTexture(desc);

            // Pass 0 of a Fullscreen Shader Graph is the procedural-triangle pass
            var blit = new RenderGraphUtils.BlitMaterialParameters(resources.cameraColor, destination, material, 0,
                propertyBlock, RenderGraphUtils.FullScreenGeometryType.ProceduralTriangle);
            using (IBaseRenderGraphBuilder builder = renderGraph.AddBlitPass(blit, passName, returnBuilder: true))
            {
                builder.UseTexture(resources.cameraDepthTexture);
            }

            resources.cameraColor = destination;
        }
    }
}
