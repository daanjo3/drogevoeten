using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

// Testing aid for Development web builds: settings from the page URL, plus an on-screen readout of performance.
// Example: index.html?quality=Mobile&scale=0.7&shadows=sun&fps=30&look=1
//   quality  quality level by name, as in Project Settings > Quality (e.g. Mobile, PC)
//   scale    URP render scale, 0.1 to 2
//   msaa     MSAA sample count: 1 (off), 2, 4 or 8
//   shadowdist   shadow distance in meters
//   shadowres    main light shadow map resolution: 256 to 4096
//   shadows  0: no light casts shadows; sun: only directional lights do; all: as set up in the scene
//   mips     texture mipmap limit: 0 full resolution, 1 half, 2 quarter (overrides the quality level's)
//   fps      frame rate cap (Application.targetFrameRate)
//   look     1: look around without fullscreen
//   hud      0: hide the readout
// Release builds and the editor ignore the URL and show no readout.
public class DebugSettings : MonoBehaviour
{
    // Lets CameraController allow looking around outside fullscreen
    public static bool LookAlways { get; private set; }

#if !UNITY_EDITOR
    private static Dictionary<string, string> args = new Dictionary<string, string>();

    // Readout, refreshed twice a second
    private const float SampleSeconds = 0.5f;
    private float sampleTime;
    private int sampleFrames;
    private float worstFrame;
    private string text = "";
    private GUIStyle style;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    private static void BeforeSceneLoad()
    {
        // Development builds only; a release build ignores the URL
        if (!Debug.isDebugBuild)
        {
            return;
        }

        args = ParseQuery(Application.absoluteURL);

        if (args.TryGetValue("quality", out string quality))
        {
            int level = Array.FindIndex(QualitySettings.names, n => string.Equals(n, quality, StringComparison.OrdinalIgnoreCase));
            if (level >= 0)
            {
                QualitySettings.SetQualityLevel(level, true);
            }
            else
            {
                Debug.LogWarning($"[DebugSettings] Unknown quality level '{quality}'; have: {string.Join(", ", QualitySettings.names)}");
            }
        }

        // After the quality level: each level can have its own pipeline asset
        if (CurrentPipeline() is UniversalRenderPipelineAsset urp)
        {
            if (TryGetFloat("scale", out float scale))
            {
                urp.renderScale = Mathf.Clamp(scale, 0.1f, 2f);
            }

            if (TryGetFloat("msaa", out float msaa))
            {
                urp.msaaSampleCount = Mathf.ClosestPowerOfTwo(Mathf.Clamp(Mathf.RoundToInt(msaa), 1, 8));
            }

            if (TryGetFloat("shadowdist", out float shadowDistance))
            {
                urp.shadowDistance = Mathf.Max(1f, shadowDistance);
            }

            if (TryGetFloat("shadowres", out float shadowResolution))
            {
                urp.mainLightShadowmapResolution = Mathf.ClosestPowerOfTwo(Mathf.Clamp(Mathf.RoundToInt(shadowResolution), 256, 4096));
            }
        }

        if (TryGetFloat("mips", out float mips))
        {
            QualitySettings.globalTextureMipmapLimit = Mathf.Clamp(Mathf.RoundToInt(mips), 0, 3);
        }

        if (TryGetFloat("fps", out float fps))
        {
            Application.targetFrameRate = Mathf.RoundToInt(fps);
        }

        LookAlways = args.TryGetValue("look", out string look) && look == "1";

        if (!(args.TryGetValue("hud", out string hud) && hud == "0"))
        {
            var go = new GameObject("DebugSettings");
            DontDestroyOnLoad(go);
            go.AddComponent<DebugSettings>();
        }

        Debug.Log($"[DebugSettings] {DescribeSettings()}");
    }

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void AfterSceneLoad()
    {
        if (!args.TryGetValue("shadows", out string shadows) || shadows == "all")
        {
            return;
        }

        bool sunOnly = shadows == "sun";
        foreach (Light light in FindObjectsByType<Light>())
        {
            if (!(sunOnly && light.type == LightType.Directional))
            {
                light.shadows = LightShadows.None;
            }
        }
    }

    private void Update()
    {
        float dt = Time.unscaledDeltaTime;
        sampleTime += dt;
        sampleFrames++;
        worstFrame = Mathf.Max(worstFrame, dt);
        if (sampleTime < SampleSeconds)
        {
            return;
        }

        float fps = sampleFrames / sampleTime;
        text = $"{fps:0.0} fps   {1000f * sampleTime / sampleFrames:0} ms (worst {1000f * worstFrame:0})\n"
             + $"{SystemInfo.graphicsDeviceType}   {Screen.width}x{Screen.height}\n"
             + DescribeSettings();
        sampleTime = 0f;
        sampleFrames = 0;
        worstFrame = 0f;
    }

    private void OnGUI()
    {
        if (style == null)
        {
            style = new GUIStyle(GUI.skin.box)
            {
                alignment = TextAnchor.LowerLeft,
                wordWrap = false,
                fontSize = Mathf.Max(12, Screen.height / 50),
            };
            style.normal.textColor = Color.white;
        }

        var content = new GUIContent(text);
        Vector2 size = style.CalcSize(content);
        GUI.Box(new Rect(8f, Screen.height - size.y - 8f, size.x, size.y), content, style);
    }

    private static string DescribeSettings()
    {
        var urp = CurrentPipeline() as UniversalRenderPipelineAsset;
        string pipeline = urp != null
            ? $"scale {urp.renderScale:0.##}   msaa {urp.msaaSampleCount}   shadow {urp.mainLightShadowmapResolution} / {urp.shadowDistance:0} m"
            : "not URP";
        string shadows = args.TryGetValue("shadows", out string s) ? s : "all";
        string cap = Application.targetFrameRate > 0 ? Application.targetFrameRate.ToString() : "none";
        return $"quality {QualitySettings.names[QualitySettings.GetQualityLevel()]}   {pipeline}\n"
             + $"mips {QualitySettings.globalTextureMipmapLimit}   shadows {shadows}   fps cap {cap}";
    }

    private static RenderPipelineAsset CurrentPipeline()
    {
        return QualitySettings.renderPipeline != null ? QualitySettings.renderPipeline : GraphicsSettings.defaultRenderPipeline;
    }

    private static bool TryGetFloat(string key, out float value)
    {
        value = 0f;
        return args.TryGetValue(key, out string raw)
            && float.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
    }

    // "https://host/page?a=1&b=two#x" -> { a: "1", b: "two" }, keys lowercased
    private static Dictionary<string, string> ParseQuery(string url)
    {
        var result = new Dictionary<string, string>();
        int start = url.IndexOf('?');
        if (start < 0)
        {
            return result;
        }

        string query = url.Substring(start + 1);
        int hash = query.IndexOf('#');
        if (hash >= 0)
        {
            query = query.Substring(0, hash);
        }

        foreach (string pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            int eq = pair.IndexOf('=');
            string key = Uri.UnescapeDataString(eq < 0 ? pair : pair.Substring(0, eq)).ToLowerInvariant();
            string value = eq < 0 ? "" : Uri.UnescapeDataString(pair.Substring(eq + 1).Replace('+', ' '));
            result[key] = value;
        }

        return result;
    }
#endif
}
