using System.Collections.Generic;
using UnityEngine;

// Spawns fish along the walls of the room once the water is deep enough, heading roughly away from their wall.
// The rate grows linearly from minRate at minHeight to maxRate at maxHeight, and stays at maxRate above that.
// Only fish that fit between the floor and the water surface are picked, so bigger fish appear as the water rises.
// The room's floor plan is the horizontal extent of the water's renderer.
public class FishSpawner : MonoBehaviour
{
    public GameObject[] fishPrefabs = new GameObject[0];

    [Tooltip("Defaults to the first WaterHeight in the scene.")]
    public WaterHeight water;
    [Tooltip("World height of the floor's top surface. Fish stay above it.")]
    public float floorHeight = 0f;

    [Tooltip("Water height (world Y) at which spawning starts.")]
    public float minHeight = 0.3f;
    [Tooltip("Water height (world Y) at which the spawn rate reaches maxRate.")]
    public float maxHeight = 2f;
    [Tooltip("Fish per second at minHeight.")]
    public float minRate = 0.2f;
    [Tooltip("Fish per second at maxHeight and above.")]
    public float maxRate = 2f;
    [Tooltip("No new fish spawn while this many are alive.")]
    public int maxFish = 30;

    [Tooltip("Gap kept between fish and the walls, floor and water surface, in meters.")]
    public float margin = 0.1f;
    [Tooltip("Largest angle between a new fish's heading and straight away from its wall, in degrees.")]
    [Range(0f, 89f)]
    public float spawnAngle = 40f;

    // Horizontal extent of the room (only x and z are meaningful)
    public Bounds Room => waterRenderer.bounds;
    public float Surface => water.transform.position.y;

    private struct FishType
    {
        public GameObject prefab;
        public Bounds body;
    }

    private readonly List<FishType> fishTypes = new List<FishType>();
    private readonly List<FishType> fitting = new List<FishType>();
    private readonly List<GameObject> alive = new List<GameObject>();
    private Renderer waterRenderer;
    // Remaining "work" until the next spawn; refilled with an exponential random amount, so spawns form a Poisson
    // process that follows the rate even while it changes
    private float spawnBudget;

    private void Start()
    {
        if (water == null)
        {
            water = FindAnyObjectByType<WaterHeight>();
        }
        waterRenderer = water != null ? water.GetComponent<Renderer>() : null;
        if (waterRenderer == null)
        {
            Debug.LogWarning("FishSpawner needs a WaterHeight with a Renderer; disabling.", this);
            enabled = false;
            return;
        }

        foreach (GameObject prefab in fishPrefabs)
        {
            if (prefab != null)
            {
                fishTypes.Add(new FishType { prefab = prefab, body = MeasureBody(prefab) });
            }
        }
        spawnBudget = NextBudget();
    }

    private void Update()
    {
        alive.RemoveAll(fish => fish == null);

        float surface = Surface;
        if (surface < minHeight || alive.Count >= maxFish)
        {
            return;
        }

        float rate = Mathf.Lerp(minRate, maxRate, Mathf.InverseLerp(minHeight, maxHeight, surface));
        spawnBudget -= rate * Time.deltaTime;
        if (spawnBudget <= 0f)
        {
            spawnBudget += NextBudget();
            Spawn(surface);
        }
    }

    private void Spawn(float surface)
    {
        fitting.Clear();
        foreach (FishType type in fishTypes)
        {
            if (surface >= MinSurfaceFor(type.body))
            {
                fitting.Add(type);
            }
        }
        if (fitting.Count == 0)
        {
            return;
        }
        FishType fish = fitting[Random.Range(0, fitting.Count)];

        // Try a few spots; skip this spawn if they're all inside furniture
        Vector3 position = Vector3.zero;
        Quaternion rotation = Quaternion.identity;
        bool found = false;
        for (int attempt = 0; attempt < 5 && !found; attempt++)
        {
            PickSpawn(fish, surface, out position, out rotation);
            found = !Physics.CheckBox(position + rotation * fish.body.center, fish.body.extents, rotation, Physics.AllLayers, QueryTriggerInteraction.Ignore);
        }
        if (!found)
        {
            return;
        }

        GameObject instance = Instantiate(fish.prefab, position, rotation);
        if (instance.TryGetComponent(out FishController controller))
        {
            controller.SetArea(this, fish.body);
        }
        alive.Add(instance);
    }

    // A point along a random wall and a heading away from it, keeping the whole body inside the room and the water
    private void PickSpawn(FishType fish, float surface, out Vector3 position, out Quaternion rotation)
    {
        Bounds room = Room;
        float clearance = HorizontalRadius(fish.body) + margin;
        Vector3 away;
        float along = Random.value;
        switch (Random.Range(0, 4))
        {
            case 0:
                position = new Vector3(room.min.x + clearance, 0f, Mathf.Lerp(room.min.z + clearance, room.max.z - clearance, along));
                away = Vector3.right;
                break;
            case 1:
                position = new Vector3(room.max.x - clearance, 0f, Mathf.Lerp(room.min.z + clearance, room.max.z - clearance, along));
                away = Vector3.left;
                break;
            case 2:
                position = new Vector3(Mathf.Lerp(room.min.x + clearance, room.max.x - clearance, along), 0f, room.min.z + clearance);
                away = Vector3.forward;
                break;
            default:
                position = new Vector3(Mathf.Lerp(room.min.x + clearance, room.max.x - clearance, along), 0f, room.max.z - clearance);
                away = Vector3.back;
                break;
        }
        position.y = Random.Range(floorHeight + margin - fish.body.min.y, surface - margin - fish.body.max.y);
        rotation = Quaternion.LookRotation(Quaternion.Euler(0f, Random.Range(-spawnAngle, spawnAngle), 0f) * away);
    }

    // Lowest water surface (world Y) at which a fish with this body can spawn: at least minHeight, and deep enough for
    // the body between the floor and the surface. Fish despawn when the water drops below it again.
    public float MinSurfaceFor(Bounds body)
    {
        return Mathf.Max(minHeight, floorHeight + 2f * margin + body.size.y);
    }

    // Distance from the pivot to the farthest point of the body horizontally, for any heading
    public static float HorizontalRadius(Bounds body)
    {
        return Mathf.Max(Mathf.Abs(body.min.x), Mathf.Abs(body.max.x), Mathf.Abs(body.min.z), Mathf.Abs(body.max.z));
    }

    private static float NextBudget()
    {
        return -Mathf.Log(1f - Random.value);
    }

    // Body bounds relative to the prefab's pivot, at the prefab's scale, unrotated. Skinned bounds are stored relative
    // to the root bone, so they go through that bone's transform.
    private static Bounds MeasureBody(GameObject prefab)
    {
        Transform root = prefab.transform;
        Bounds body = new Bounds();
        bool first = true;
        foreach (Renderer renderer in prefab.GetComponentsInChildren<Renderer>())
        {
            Transform space = renderer.transform;
            Bounds local;
            if (renderer is SkinnedMeshRenderer skinned)
            {
                local = skinned.localBounds;
                if (skinned.rootBone != null)
                {
                    space = skinned.rootBone;
                }
            }
            else if (renderer.TryGetComponent(out MeshFilter filter) && filter.sharedMesh != null)
            {
                local = filter.sharedMesh.bounds;
            }
            else
            {
                continue;
            }

            Matrix4x4 toRoot = Matrix4x4.Scale(root.localScale) * root.worldToLocalMatrix * space.localToWorldMatrix;
            for (int i = 0; i < 8; i++)
            {
                Vector3 corner = local.center + Vector3.Scale(local.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                Vector3 point = toRoot.MultiplyPoint3x4(corner);
                if (first)
                {
                    body = new Bounds(point, Vector3.zero);
                    first = false;
                }
                else
                {
                    body.Encapsulate(point);
                }
            }
        }
        return body;
    }
}
