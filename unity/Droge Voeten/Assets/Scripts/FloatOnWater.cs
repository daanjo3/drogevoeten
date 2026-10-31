using UnityEngine;

// Floats an object (e.g. the rubber duck) on a water surface: it rises and falls with the water's mean height, bobs,
// drifts a little around the spot where it was placed and turns a little around the direction it was placed in.
// It is only visible (and its colliders only active) while the water is.
// The waves themselves only exist in the water shader, so the bobbing imitates them instead of following them exactly.
public class FloatOnWater : MonoBehaviour
{
    [Tooltip("Defaults to the smallest water whose area contains this object (the room water rather than the house's).")]
    public WaterHeight water;

    [Tooltip("Height of this object's pivot above the water's mean surface, in meters.")]
    public float heightAboveSurface = 0.01f;

    [Tooltip("Largest up/down bob, in meters.")]
    public float bobHeight = 0.02f;
    [Tooltip("Largest drift away from the placed position, in meters.")]
    public float driftRadius = 0.15f;
    [Tooltip("Largest turn away from the placed direction, in degrees.")]
    public float yawRange = 15f;
    [Tooltip("Largest tilt forward/back and sideways, in degrees.")]
    public float tiltRange = 4f;
    [Tooltip("How fast the bobbing, drifting and turning change; roughly swings per second.")]
    public float speed = 0.3f;

    private Vector3 homePosition;
    private Quaternion homeRotation;
    // How far the lowest point of the object is below its pivot; keeps it from sinking into the floor in shallow water
    private float bottomBelowPivot;
    private Renderer[] renderers;
    private Collider[] colliders;
    private int noiseSeed;
    private float noiseOffset;
    private bool shown = true;

    private void Start()
    {
        homePosition = transform.position;
        homeRotation = transform.rotation;
        renderers = GetComponentsInChildren<Renderer>();
        colliders = GetComponentsInChildren<Collider>();
        noiseSeed = Random.Range(0, int.MaxValue - 6);
        noiseOffset = Random.value * 100f;

        float bottom = transform.position.y;
        foreach (Renderer r in renderers)
        {
            bottom = Mathf.Min(bottom, r.bounds.min.y);
        }
        bottomBelowPivot = transform.position.y - bottom;

        if (water == null)
        {
            water = FindContainingWater();
        }
        if (water == null)
        {
            Debug.LogWarning("FloatOnWater found no water under this object; disabling.", this);
            enabled = false;
        }
    }

    private void LateUpdate()
    {
        bool visible = water.IsVisible;
        if (visible != shown)
        {
            shown = visible;
            foreach (Renderer r in renderers)
            {
                r.enabled = visible;
            }
            foreach (Collider c in colliders)
            {
                c.enabled = visible;
            }
        }
        if (!visible)
        {
            return;
        }

        // Smooth noise per channel; the offsets keep the channels from passing zero together (see PerlinNoise1D)
        float t = Time.time * speed + noiseOffset;
        float Noise(int channel) => PerlinNoise1D.Noise(t + channel * 0.37f, noiseSeed + channel);

        float y = water.transform.position.y + heightAboveSurface + bobHeight * Noise(0);
        y = Mathf.Max(y, water.floorHeight + bottomBelowPivot);
        Vector3 drift = new Vector3(Noise(1), 0f, Noise(2)) * driftRadius;
        transform.position = new Vector3(homePosition.x + drift.x, y, homePosition.z + drift.z);

        transform.rotation = Quaternion.AngleAxis(yawRange * Noise(3), Vector3.up) * homeRotation
            * Quaternion.Euler(tiltRange * Noise(4), 0f, tiltRange * Noise(5));
    }

    private WaterHeight FindContainingWater()
    {
        WaterHeight best = null;
        float bestArea = float.MaxValue;
        Vector3 p = transform.position;
        foreach (WaterHeight candidate in FindObjectsByType<WaterHeight>())
        {
            if (!candidate.TryGetComponent(out Renderer r))
            {
                continue;
            }
            Bounds b = r.bounds;
            float area = b.size.x * b.size.z;
            if (p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z && area < bestArea)
            {
                best = candidate;
                bestArea = area;
            }
        }
        return best;
    }
}
