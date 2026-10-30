using UnityEngine;

public class FishController : MonoBehaviour
{
    public float speed = 1.0f;
    public float minTtl = 5.0f;
    public float maxTtl = 15.0f;
    private float despawnTime;

    // Largest extra speed along the fish's own axes (x sideways, y up/down, z forward/back), drifting smoothly over time
    public Vector3 variance = Vector3.zero;
    // How fast that extra speed changes; roughly the number of swings per second
    public float varianceFrequency = 0.5f;
    private int noiseSeed;
    private float noiseOffset;

    [Tooltip("Distance from a wall at which the fish starts turning away, in meters.")]
    public float turnDistance = 1.0f;
    [Tooltip("How fast the fish turns away from walls, in degrees per second.")]
    public float turnSpeed = 90f;

    // Set by FishSpawner; without it the fish swims straight (for example when placed by hand)
    private FishSpawner area;
    private Bounds body;


    // Start is called once before the first execution of Update after the MonoBehaviour is created
    private void OnEnable()
    {
        despawnTime = Time.time + Random.Range(minTtl, maxTtl);
        noiseSeed = Random.Range(0, int.MaxValue - 2);
        noiseOffset = Random.value * 100f;
    }

    // Update is called once per frame
    private void Update()
    {
        if(Time.time >= despawnTime)
        {
            Destroy(this.gameObject);
            return;
        }

        // Each fish and axis samples its own noise; the offsets keep them from all passing zero (at whole t) together
        float t = Time.time * varianceFrequency + noiseOffset;
        Vector3 wobble = new Vector3(
            variance.x * PerlinNoise1D.Noise(t, noiseSeed),
            variance.y * PerlinNoise1D.Noise(t + 0.33f, noiseSeed + 1),
            variance.z * PerlinNoise1D.Noise(t + 0.67f, noiseSeed + 2));

        transform.position += (speed * transform.forward + transform.TransformDirection(wobble)) * Time.deltaTime;

        if (area != null)
        {
            SteerAwayFromWalls();
            KeepInside();
        }
    }

    // Called by FishSpawner. `bodyBounds` is the fish's body relative to its pivot, at its scale.
    public void SetArea(FishSpawner spawner, Bounds bodyBounds)
    {
        area = spawner;
        body = bodyBounds;
    }

    // Turn (around Y only) away from walls closer than turnDistance; the closer the wall, the stronger the push
    private void SteerAwayFromWalls()
    {
        Bounds room = area.Room;
        float clearance = FishSpawner.HorizontalRadius(body) + area.margin;
        Vector3 p = transform.position;

        Vector3 push = Vector3.zero;
        push.x += Mathf.Clamp01((room.min.x + clearance + turnDistance - p.x) / turnDistance);
        push.x -= Mathf.Clamp01((p.x - (room.max.x - clearance - turnDistance)) / turnDistance);
        push.z += Mathf.Clamp01((room.min.z + clearance + turnDistance - p.z) / turnDistance);
        push.z -= Mathf.Clamp01((p.z - (room.max.z - clearance - turnDistance)) / turnDistance);
        if (push == Vector3.zero)
        {
            return;
        }

        Vector3 heading = transform.forward;
        heading.y = 0f;
        Vector3 desired = heading.normalized + 2f * push;
        if (desired.sqrMagnitude > 1e-4f)
        {
            Quaternion target = Quaternion.LookRotation(desired, Vector3.up);
            transform.rotation = Quaternion.RotateTowards(transform.rotation, target, turnSpeed * Time.deltaTime);
        }
    }

    // Keep the whole body inside the room and between the floor and the water surface
    private void KeepInside()
    {
        Bounds room = area.Room;
        float clearance = FishSpawner.HorizontalRadius(body) + area.margin;
        float bottom = area.floorHeight + area.margin - body.min.y;
        float top = area.Surface - area.margin - body.max.y;

        Vector3 p = transform.position;
        p.x = Mathf.Clamp(p.x, room.min.x + clearance, Mathf.Max(room.min.x + clearance, room.max.x - clearance));
        p.z = Mathf.Clamp(p.z, room.min.z + clearance, Mathf.Max(room.min.z + clearance, room.max.z - clearance));
        p.y = Mathf.Clamp(p.y, bottom, Mathf.Max(bottom, top));
        transform.position = p;
    }
}
