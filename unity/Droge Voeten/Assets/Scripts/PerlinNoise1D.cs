using UnityEngine;

public static class PerlinNoise1D
{
    // Smooth noise in [-1, 1]. Whole numbers always return 0, so offset or scale x to avoid sampling only those.
    public static float Noise(float x, int seed = 0)
    {
        int i0 = Mathf.FloorToInt(x);
        float t = x - i0;

        float n0 = Gradient(i0, seed) * t;
        float n1 = Gradient(i0 + 1, seed) * (t - 1f);

        float u = t * t * t * (t * (t * 6f - 15f) + 10f);
        return Mathf.Lerp(n0, n1, u) * 2f;
    }

    // Pseudo-random gradient in [-1, 1] for an integer lattice point.
    private static float Gradient(int i, int seed)
    {
        unchecked
        {
            uint h = (uint)i * 0x27d4eb2du ^ (uint)seed * 0x9e3779b9u;
            h ^= h >> 15;
            h *= 0x85ebca6bu;
            h ^= h >> 13;
            h *= 0xc2b2ae35u;
            h ^= h >> 16;
            return h / (float)uint.MaxValue * 2f - 1f;
        }
    }
}
