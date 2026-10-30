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
        bool fullscreen = WebBridge.IsFullscreen();
        if (button.gameObject.activeSelf != fullscreen)
        {
            button.gameObject.SetActive(fullscreen);
        }
    }

    public void OnPointerClick(PointerEventData eventData)
    {
        Cursor.lockState = CursorLockMode.None;
        WebBridge.ExitFullscreen();
        button.gameObject.SetActive(false);
    }
}
