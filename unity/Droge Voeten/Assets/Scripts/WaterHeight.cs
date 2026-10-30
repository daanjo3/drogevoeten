using UnityEngine;

public class WaterHeight : MonoBehaviour
{
    float targetHeight;

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
}
