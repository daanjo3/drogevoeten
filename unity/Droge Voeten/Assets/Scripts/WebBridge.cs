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

    public void SetWaterHeight(float meters)
    {
        WaterHeight waterHeight = FindAnyObjectByType<WaterHeight>();

        if(waterHeight != null)
        {
            waterHeight.SetHeight(meters);
        }
    }

    // Send an event to the page, where unity.on(eventName, handler) receives `detail`
    public static void Emit(string eventName, string detail)
    {
        WebBridge_Emit(eventName, detail ?? "");
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void WebBridge_Emit(string eventName, string detail);
#else
    private static void WebBridge_Emit(string eventName, string detail)
    {
        Debug.Log($"[WebBridge] {eventName}: {detail}");
    }
#endif
}
