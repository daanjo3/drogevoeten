using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

// Look around without moving: drag with the mouse or a finger, or use the gamepad's right stick.
// Only active while the player is fullscreen; otherwise the camera eases back to its current view pose.
// The mouse never locks, so the fullscreen exit button stays clickable.
// SetView("room" / "house") fades to black, jumps to another view pose and fades back in; looking around works
// around that pose.
[RequireComponent(typeof(Camera))]
public class CameraController : MonoBehaviour
{
    public enum View { Room, House }

    // The view whose pose is on screen; changes at the moment the screen is black during a switch
    public View ShownView { get; private set; } = View.Room;

    [Tooltip("Rotation for a drag across the full screen height, in multiples of the camera's vertical field of view.")]
    [SerializeField]
    private float dragSensitivity = 1f;

    [Tooltip("Gamepad right stick turn speed at full tilt, in degrees per second.")]
    [SerializeField]
    private float stickSpeed = 120f;

    [Tooltip("How far you can look up or down from the starting pose, in degrees.")]
    [SerializeField]
    [Range(0f, 89f)]
    private float pitchLimit = 80f;

    [Tooltip("How fast the camera returns to its view pose when not fullscreen. Higher is faster.")]
    [SerializeField]
    private float returnSpeed = 4f;

    [Tooltip("Editor only: look around in play mode without fullscreen, which the Game view can't do.")]
    [SerializeField]
    private bool lookInEditor = true;
    
    [Tooltip("The default pose when in 'observe room' mode instead of 'observe house' mode")]
    [SerializeField]
    private Transform roomPose;

    [Tooltip("The default pose when in 'observe house' mode instead of the default 'observe room' mode")]
    [SerializeField]
    private Transform housePose;

    [Tooltip("How long fading to black, and fading back in, each take when switching views, in seconds.")]
    [SerializeField]
    private float fadeDuration = 0.4f;


    private Camera cam;
    // The current view pose; look-around offsets are applied on top of it
    private Vector3 basePosition;
    private Quaternion baseRotation;
    private bool hasBasePose;

    // View switch: fade to black, jump to switchTarget, fade back in. switchTarget is null once the jump is done.
    private Transform switchTarget;
    // The view SetView last switched to (Room at the start); ShownView catches up at the jump
    private View currentView = View.Room;
    // 0 = clear, 1 = black
    private float fade;
    private GameObject fadeCanvas;
    private Image fadeImage;

    // Offsets from the starting pose, in degrees. Positive pitch looks up.
    private float yaw;
    private float pitch;

    private void Awake()
    {
        cam = GetComponent<Camera>();
        CreateFadeOverlay();
    }

    // A full-screen black image on top of everything (including post-processing), created at runtime
    private void CreateFadeOverlay()
    {
        fadeCanvas = new GameObject("View Fade", typeof(Canvas));
        fadeCanvas.transform.SetParent(transform, false);
        var canvas = fadeCanvas.GetComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = short.MaxValue;

        var imageObject = new GameObject("Black", typeof(RectTransform), typeof(Image));
        imageObject.transform.SetParent(fadeCanvas.transform, false);
        var rect = (RectTransform)imageObject.transform;
        rect.anchorMin = Vector2.zero;
        rect.anchorMax = Vector2.one;
        rect.offsetMin = Vector2.zero;
        rect.offsetMax = Vector2.zero;
        fadeImage = imageObject.GetComponent<Image>();
        fadeImage.color = Color.black;
        fadeImage.raycastTarget = false;

        fadeCanvas.SetActive(false);
    }

    private void OnEnable()
    {
        // Only once, so toggling the component while looking away doesn't move the home pose.
        // Starts in the room view; without a roomPose, wherever the camera was placed.
        if (!hasBasePose)
        {
            Transform start = roomPose != null ? roomPose : transform;
            basePosition = start.position;
            baseRotation = start.rotation;
            hasBasePose = true;
        }
    }

    // "room" or "house" (as sent by the web page through WebBridge.SetView): fade over to that view pose
    public void SetView(string view)
    {
        View? requested = view?.Trim().ToLowerInvariant() switch
        {
            "room" => View.Room,
            "house" => View.House,
            _ => null,
        };
        Transform target = requested == View.Room ? roomPose : requested == View.House ? housePose : null;
        if (target == null)
        {
            Debug.LogWarning($"[CameraController] Unknown view '{view}' or its pose isn't assigned; expected \"room\" or \"house\".");
            return;
        }

        // Already there (and not on the way elsewhere): nothing to do
        if (switchTarget == null && basePosition == target.position && baseRotation == target.rotation)
        {
            return;
        }

        // A switch during a fade simply changes where it ends up; a fade-in in progress turns back to black
        switchTarget = target;
        currentView = requested.Value;
    }

    private void Update()
    {
#if UNITY_EDITOR
        // Editor only, for testing: space toggles between the room and house views
        if (Keyboard.current != null && Keyboard.current.spaceKey.wasPressedThisFrame)
        {
            SetView(currentView == View.Room ? "house" : "room");
        }
#endif

        UpdateFade();

        // No looking around until the jump; it starts again from straight ahead at the new pose
        if (LookEnabled() && switchTarget == null)
        {
            Vector2 look = ReadLook();
            yaw = Mathf.DeltaAngle(0f, yaw + look.x);
            pitch = Mathf.Clamp(pitch + look.y, -pitchLimit, pitchLimit);
        }
        else
        {
            // Framerate-independent ease back to the view pose; yaw stays in [-180, 180], so it takes the short way
            float t = 1f - Mathf.Exp(-returnSpeed * Time.unscaledDeltaTime);
            yaw = Mathf.Lerp(yaw, 0f, t);
            pitch = Mathf.Lerp(pitch, 0f, t);
            if (Mathf.Abs(yaw) < 0.01f && Mathf.Abs(pitch) < 0.01f)
            {
                yaw = 0f;
                pitch = 0f;
            }
        }

        transform.SetPositionAndRotation(basePosition,
            Quaternion.AngleAxis(yaw, Vector3.up) * baseRotation * Quaternion.AngleAxis(-pitch, Vector3.right));
    }

    // Fade towards black while a switch is pending; once black, jump to the target pose and fade back in
    private void UpdateFade()
    {
        float step = fadeDuration > 0f ? Time.unscaledDeltaTime / fadeDuration : 1f;
        if (switchTarget != null)
        {
            fade = Mathf.MoveTowards(fade, 1f, step);
            if (fade >= 1f)
            {
                basePosition = switchTarget.position;
                baseRotation = switchTarget.rotation;
                yaw = 0f;
                pitch = 0f;
                switchTarget = null;
                ShownView = currentView;
            }
        }
        else
        {
            fade = Mathf.MoveTowards(fade, 0f, step);
        }

        fadeCanvas.SetActive(fade > 0f);
        fadeImage.color = new Color(0f, 0f, 0f, Mathf.SmoothStep(0f, 1f, fade));
    }

    private bool LookEnabled()
    {
#if UNITY_EDITOR
        if (lookInEditor)
        {
            return true;
        }
#endif
        return WebBridge.IsFullscreen();
    }

    // Change in (yaw, pitch) this frame, in degrees
    private Vector2 ReadLook()
    {
        Vector2 look = Vector2.zero;

        // Drags grab the scene: dragging right turns the view left. Touch wins, in case the browser also reports it as a mouse.
        float degreesPerPixel = cam.fieldOfView * dragSensitivity / Mathf.Max(Screen.height, 1);
        Touchscreen touchscreen = Touchscreen.current;
        Mouse mouse = Mouse.current;
        if (touchscreen != null && touchscreen.primaryTouch.press.isPressed)
        {
            if (!touchscreen.primaryTouch.press.wasPressedThisFrame)
            {
                look -= touchscreen.primaryTouch.delta.ReadValue() * degreesPerPixel;
            }
        }
        else if (mouse != null && mouse.leftButton.isPressed && !mouse.leftButton.wasPressedThisFrame)
        {
            look -= mouse.delta.ReadValue() * degreesPerPixel;
        }

        Gamepad gamepad = Gamepad.current;
        if (gamepad != null)
        {
            look += gamepad.rightStick.ReadValue() * (stickSpeed * Time.unscaledDeltaTime);
        }

        return look;
    }
}
