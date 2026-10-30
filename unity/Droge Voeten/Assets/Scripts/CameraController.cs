using UnityEngine;
using UnityEngine.InputSystem;

// Look around without moving: drag with the mouse or a finger, or use the gamepad's right stick.
// Only active while the player is fullscreen; otherwise the camera eases back to the pose it started in.
// The mouse never locks, so the fullscreen exit button stays clickable.
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

    [Tooltip("How fast the camera returns to its starting pose when not fullscreen. Higher is faster.")]
    [SerializeField]
    private float returnSpeed = 4f;

    [Tooltip("Editor only: look around in play mode without fullscreen, which the Game view can't do.")]
    [SerializeField]
    private bool lookInEditor = true;

    private Camera cam;
    private Quaternion defaultRotation;
    private bool hasDefaultRotation;

    // Offsets from the starting pose, in degrees. Positive pitch looks up.
    private float yaw;
    private float pitch;

    private void Awake()
    {
        cam = GetComponent<Camera>();
    }

    private void OnEnable()
    {
        // Only once, so toggling the component while looking away doesn't move the home pose
        if (!hasDefaultRotation)
        {
            defaultRotation = transform.localRotation;
            hasDefaultRotation = true;
        }
    }

    private void Update()
    {
        if (LookEnabled())
        {
            Vector2 look = ReadLook();
            yaw = Mathf.DeltaAngle(0f, yaw + look.x);
            pitch = Mathf.Clamp(pitch + look.y, -pitchLimit, pitchLimit);
        }
        else
        {
            // Framerate-independent ease back to the starting pose; yaw stays in [-180, 180], so it takes the short way
            float t = 1f - Mathf.Exp(-returnSpeed * Time.unscaledDeltaTime);
            yaw = Mathf.Lerp(yaw, 0f, t);
            pitch = Mathf.Lerp(pitch, 0f, t);
            if (Mathf.Abs(yaw) < 0.01f && Mathf.Abs(pitch) < 0.01f)
            {
                yaw = 0f;
                pitch = 0f;
            }
        }

        transform.localRotation = Quaternion.AngleAxis(yaw, Vector3.up) * defaultRotation * Quaternion.AngleAxis(-pitch, Vector3.right);
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
