using UnityEngine;
using UnityEngine.Rendering;

// Sets this volume's weight from how far the camera is under the water surface: 0 above water, 1 under water.
[RequireComponent(typeof(Volume))]
public class UnderwaterVolume : MonoBehaviour
{
    [Tooltip("Defaults to the first WaterHeight in the scene.")]
    public WaterHeight water;

    [Tooltip("Defaults to the main camera.")]
    public Camera targetCamera;

    private Volume volume;

    private void Awake()
    {
        volume = GetComponent<Volume>();
        if (water == null)
        {
            water = FindAnyObjectByType<WaterHeight>();
        }
    }

    private void LateUpdate()
    {
        Camera cam = targetCamera != null ? targetCamera : Camera.main;
        volume.weight = water != null && cam != null ? water.UnderwaterAmount(cam.transform.position.y) : 0f;
    }
}
