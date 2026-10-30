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
    }
}
