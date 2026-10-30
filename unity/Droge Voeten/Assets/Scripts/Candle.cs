using UnityEngine;

[RequireComponent(typeof(Light))]
public class Candle : MonoBehaviour
{
    public float variation = 0.5f;
    public float speed = 1.0f;
    private Light light;
    private float initialIntensity;
    private int seed;
    private float offset;
    private float startTime;

    private void OnEnable()
    {
        const float offsetRange = 100f;

        light = GetComponent<Light>();
        initialIntensity = light.intensity;
        seed = UnityEngine.Random.Range(int.MinValue, int.MaxValue);
        offset = UnityEngine.Random.Range(-offsetRange, offsetRange);
        startTime = Time.time;
    }

    // Update is called once per frame
    void Update()
    {
        float val = PerlinNoise1D.Noise(offset + ((Time.time - startTime) * speed), seed);

        light.intensity = initialIntensity + (val * variation);
    }
}
