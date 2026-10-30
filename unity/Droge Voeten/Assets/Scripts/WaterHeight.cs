using UnityEngine;

public class WaterHeight : MonoBehaviour
{
    float targetHeight;

    // Height over which a camera goes from fully above water to fully under it, centred on the surface.
    // Keep it larger than the surface's wave displacement and the camera's near clip distance.
    public float transitionHeight = 0.4f;

    private void OnEnable()
    {
        targetHeight = transform.position.y;
    }

    // Update is called once per frame
    private void Update()
    {
        Vector3 curPos = transform.position;

        float newHeight = Mathf.MoveTowards(curPos.y, targetHeight, 0.1f * Time.deltaTime);
        Vector3 newPos = new(curPos.x, newHeight, curPos.z);

        transform.position = newPos;
    }

    public void SetHeight(float meters)
    {
        targetHeight = meters;
    }

    // 0 when the camera is fully above water, 1 when fully under, smooth in between
    public float UnderwaterAmount(float cameraHeight)
    {
        float halfBand = transitionHeight * 0.5f;
        float surface = transform.position.y;
        return Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(surface + halfBand, surface - halfBand, cameraHeight));
    }
}
