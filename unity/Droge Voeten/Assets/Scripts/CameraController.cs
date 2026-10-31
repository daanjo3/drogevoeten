using UnityEngine;
using UnityEngine.InputSystem;

// Look around without moving: drag with the mouse or a finger, or use the gamepad's right stick.
// Only active while the player is fullscreen; otherwise the camera eases back to its current view pose.
// The mouse never locks, so the fullscreen exit button stays clickable.
// SetView("room" / "house") flies the camera in an arc to another view pose; looking around works around that pose.
[RequireComponent(typeof(Camera))]
public class CameraController : MonoBehaviour
{
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

    [Tooltip("How long a move between view poses takes, in seconds.")]
    [SerializeField]
    private float moveDuration = 2f;

    [Tooltip("How far the arc between view poses rises above the higher of the two poses, in meters.")]
    [SerializeField]
    private float arcHeight = 2f;


    private Camera cam;
    // The current view pose; look-around offsets are applied on top of it
    private Vector3 basePosition;
    private Quaternion baseRotation;
    private bool hasBasePose;

    // Move between view poses: a cubic Bezier from moveFrom to moveTo, rising arcHeight above both
    private bool moving;
    // The view SetView last flew to ("room" at the start)
    private string currentView = "room";
    private float moveTime;
    private Vector3 moveFrom, moveControl1, moveControl2, moveTo;
    private Quaternion moveFromRotation, moveToRotation;

    // Offsets from the starting pose, in degrees. Positive pitch looks up.
    private float yaw;
    private float pitch;

    private void Awake()
    {
        cam = GetComponent<Camera>();
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

    // "room" or "house" (as sent by the web page through WebBridge.SetView): fly to that view pose
    public void SetView(string view)
    {
        Transform target = view?.Trim().ToLowerInvariant() switch
        {
            "room" => roomPose,
            "house" => housePose,
            _ => null,
        };
        if (target == null)
        {
            Debug.LogWarning($"[CameraController] Unknown view '{view}' or its pose isn't assigned; expected \"room\" or \"house\".");
            return;
        }

        moveFrom = basePosition;
        moveTo = target.position;
        moveFromRotation = baseRotation;
        moveToRotation = target.rotation;

        // Control points straight above both ends, high enough that the curve's top is arcHeight above the higher end.
        // A cubic Bezier with both control points at height h peaks at 0.75 h + 0.25 * (average end height).
        float apex = Mathf.Max(moveFrom.y, moveTo.y) + arcHeight;
        float controlHeight = (apex - 0.25f * 0.5f * (moveFrom.y + moveTo.y)) / 0.75f;
        moveControl1 = new Vector3(moveFrom.x, controlHeight, moveFrom.z);
        moveControl2 = new Vector3(moveTo.x, controlHeight, moveTo.z);

        moveTime = 0f;
        moving = true;
        currentView = target == housePose ? "house" : "room";
    }

    private void Update()
    {
#if UNITY_EDITOR
        // Editor only, for testing: space toggles between the room and house views
        if (Keyboard.current != null && Keyboard.current.spaceKey.wasPressedThisFrame)
        {
            SetView(currentView == "room" ? "house" : "room");
        }
#endif

        if (moving)
        {
            moveTime += Time.unscaledDeltaTime;
            float t = moveDuration > 0f ? Mathf.Clamp01(moveTime / moveDuration) : 1f;
            float eased = Mathf.SmoothStep(0f, 1f, t);
            basePosition = Bezier(moveFrom, moveControl1, moveControl2, moveTo, eased);
            baseRotation = Quaternion.Slerp(moveFromRotation, moveToRotation, eased);
            moving = t < 1f;
        }

        // No looking around during a move; the offsets ease back so the camera arrives looking straight ahead
        if (LookEnabled() && !moving)
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

    private static Vector3 Bezier(Vector3 a, Vector3 b, Vector3 c, Vector3 d, float t)
    {
        float u = 1f - t;
        return u * u * u * a + 3f * u * u * t * b + 3f * u * t * t * c + t * t * t * d;
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
