using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

// Shows its button only while the player is fullscreen. Clicking or tapping it leaves fullscreen and hands
// control back to the web page. Clicks on the child graphic bubble up to this component.
public class FullscreenButton : MonoBehaviour, IPointerClickHandler
{
    [Tooltip("Shown only in fullscreen. Defaults to the first Graphic among the children.")]
    [SerializeField]
    private Graphic button;

    private void Awake()
    {
        if (button == null)
        {
            button = GetComponentInChildren<Graphic>(true);
        }
        button.gameObject.SetActive(false);
    }

    private void Update()
    {
        bool fullscreen = IsFullscreen();
        if (button.gameObject.activeSelf != fullscreen)
        {
            button.gameObject.SetActive(fullscreen);
        }
    }

    public void OnPointerClick(PointerEventData eventData)
    {
        Cursor.lockState = CursorLockMode.None;
        ExitFullscreen();
        button.gameObject.SetActive(false);
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern int WebBridge_IsFullscreen();

    [DllImport("__Internal")]
    private static extern void WebBridge_ExitFullscreen();

    private static bool IsFullscreen() => WebBridge_IsFullscreen() != 0;

    private static void ExitFullscreen() => WebBridge_ExitFullscreen();
#else
    private static bool IsFullscreen() => Screen.fullScreen;

    private static void ExitFullscreen() => Screen.fullScreen = false;
#endif
}
