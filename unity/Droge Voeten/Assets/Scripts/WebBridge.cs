using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;

// Link between the web page and the game. The page calls public methods here through unity-embed.js
// (unity.send("Method", value) -> SendMessage("WebBridge", ...)); Emit sends events back (unity.on("name", ...)).
// Methods the page calls must take no argument, or one string, int or float.
public class WebBridge : MonoBehaviour
{
    // Created at startup, so no scene needs a WebBridge object
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    private static void Create()
    {
        var go = new GameObject("WebBridge");
        DontDestroyOnLoad(go);
        go.AddComponent<WebBridge>();
    }

    private void Awake()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        // Leave the keyboard to the rest of the web app; Unity only gets keys while its canvas has focus
        WebGLInput.captureAllKeyboardInput = false;
#endif
    }

    private void Start()
    {
        Emit("ready", "");
    }

    // Example call from the page: unity.send("Ping", "hello"). Replies with a "pong" event carrying the same text.
    public void Ping(string message)
    {
        Emit("pong", message);
    }

    // unity.send("SetWaterHeight", meters): water level in meters above the floor (0 = dry). Applies to every
    // WaterHeight in the scene (e.g. the room's and the house view's), each measured from its own floorHeight.
    public void SetWaterHeight(float meters)
    {
        foreach (WaterHeight waterHeight in FindObjectsByType<WaterHeight>())
        {
            waterHeight.SetLevel(meters);
        }
    }

    // unity.send("SetView", "room" | "house"): fly the camera to that view
    public void SetView(string view)
    {
        CameraController cameraController = FindAnyObjectByType<CameraController>();

        if(cameraController != null)
        {
            cameraController.SetView(view);
        }
    }

    // True while the page shows the player fullscreen in a way the browser doesn't report, such as a
    // window-filling fallback on phones without element fullscreen. See SetLookEnabled.
    public static bool PageLookEnabled { get; private set; }

    // unity.send("SetLookEnabled", 1 | 0): the page says whether looking around should be on, because the
    // room fills the screen (real fullscreen or its own fallback). A number, as SendMessage passes it as a float.
    public void SetLookEnabled(float on)
    {
        PageLookEnabled = on > 0.5f;
    }

    // Cameras switched off by SetPaused, to switch back on when it resumes
    private readonly List<Camera> pausedCameras = new List<Camera>();

    // unity.send("SetPaused", 1 | 0): the page says nobody can see the player (scrolled away, or behind another
    // screen). Paused, the cameras are off, so nothing is rendered and the GPU is left to the rest of the page; the
    // scene itself keeps running, so the water and fish are where you'd expect them when it resumes.
    public void SetPaused(float paused)
    {
        if (paused > 0.5f)
        {
            if (pausedCameras.Count > 0)
            {
                return;
            }

            foreach (Camera cam in Camera.allCameras)
            {
                cam.enabled = false;
                pausedCameras.Add(cam);
            }

            if (Debug.isDebugBuild)
            {
                Debug.Log($"[WebBridge] Rendering paused: {pausedCameras.Count} camera(s) off");
            }
        }
        else if (pausedCameras.Count > 0)
        {
            foreach (Camera cam in pausedCameras)
            {
                if (cam != null)
                {
                    cam.enabled = true;
                }
            }

            if (Debug.isDebugBuild)
            {
                Debug.Log($"[WebBridge] Rendering resumed: {pausedCameras.Count} camera(s) on");
            }
            pausedCameras.Clear();
        }
    }

    // Send an event to the page, where unity.on(eventName, handler) receives `detail`
    public static void Emit(string eventName, string detail)
    {
        WebBridge_Emit(eventName, detail ?? "");
    }

    // True while the browser shows the player fullscreen (in the editor: while the player window is fullscreen)
    public static bool IsFullscreen()
    {
        return WebBridge_IsFullscreen() != 0;
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void WebBridge_Emit(string eventName, string detail);

    [DllImport("__Internal")]
    private static extern int WebBridge_IsFullscreen();
#else
    private static void WebBridge_Emit(string eventName, string detail)
    {
        Debug.Log($"[WebBridge] {eventName}: {detail}");
    }

    private static int WebBridge_IsFullscreen() => Screen.fullScreen ? 1 : 0;
#endif
}
