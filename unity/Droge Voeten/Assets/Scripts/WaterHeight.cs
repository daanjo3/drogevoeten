using UnityEngine;

public class WaterHeight : MonoBehaviour
{
    float targetHeight;
    bool hasLevel;
    Renderer waterRenderer;
    CameraController cameraController;

    // World height of the floor's top. SetLevel measures from here.
    public float floorHeight = 0.1f;
    [Tooltip("The camera view this water belongs to; it's hidden while the other view is on screen.")]
    public CameraController.View view = CameraController.View.Room;
    // How fast the surface moves to a new height, in meters per second
    public float riseSpeed = 0.2f;

    // Height over which a camera goes from fully above water to fully under it, centred on the surface.
    // Keep it larger than the surface's wave displacement and the camera's near clip distance.
    public float transitionHeight = 0.4f;

    private void Awake()
    {
        waterRenderer = GetComponent<Renderer>();
        cameraController = FindAnyObjectByType<CameraController>();
    }

    private void OnEnable()
    {
        targetHeight = transform.position.y;
        UpdateVisibility();
    }

    // Update is called once per frame
    private void Update()
    {
        Vector3 curPos = transform.position;

        float newHeight = Mathf.MoveTowards(curPos.y, targetHeight, riseSpeed * Time.deltaTime);
        Vector3 newPos = new(curPos.x, newHeight, curPos.z);

        transform.position = newPos;
        UpdateVisibility();
    }

    // Whether the water is drawn right now (see UpdateVisibility)
    public bool IsVisible => waterRenderer != null && !waterRenderer.forceRenderingOff;

    // Draw nothing while the surface is at or under the floor (otherwise the wave displacement pokes through it) or
    // while the camera shows the other view. forceRenderingOff keeps the renderer's bounds valid (FishSpawner uses
    // them as the room's floor plan).
    private void UpdateVisibility()
    {
        if (waterRenderer != null)
        {
            bool otherView = cameraController != null && cameraController.ShownView != view;
            waterRenderer.forceRenderingOff = transform.position.y <= floorHeight || otherView;
        }
    }

    public void SetHeight(float meters)
    {
        targetHeight = meters;
    }

    // Water level in meters above the floor, as the web page's scenario computes it. The first level jumps there
    // directly so the room doesn't start by draining or filling; later ones move at riseSpeed. At 0 the surface
    // goes just under the floor, where it isn't drawn.
    public void SetLevel(float metersAboveFloor)
    {
        SetHeight(metersAboveFloor > 0f ? floorHeight + metersAboveFloor : floorHeight - 0.05f);
        if (!hasLevel)
        {
            hasLevel = true;
            Vector3 position = transform.position;
            position.y = targetHeight;
            transform.position = position;
            UpdateVisibility();
        }
    }

    // 0 when the camera is fully above water, 1 when fully under, smooth in between
    public float UnderwaterAmount(float cameraHeight)
    {
        float halfBand = transitionHeight * 0.5f;
        float surface = transform.position.y;
        return Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(surface + halfBand, surface - halfBand, cameraHeight));
    }
}
