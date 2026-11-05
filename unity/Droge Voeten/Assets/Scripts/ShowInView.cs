using System.Collections.Generic;
using UnityEngine;

// Shows this object and everything under it only while the camera shows the given view (CameraController.ShownView),
// e.g. the room only in the room view and the canal house only in the house view. The switch happens while the
// screen is black between views.
// Hidden, its renderers aren't drawn and its lights are off, but the objects stay active: their scripts keep running
// (the water still gets new levels) and static batching is unaffected. A water surface under it is left to its
// WaterHeight, which also hides it when the water is at or under the floor, and asks IsShown for the view part.
public class ShowInView : MonoBehaviour
{
    [Tooltip("The view in which this is shown; it's hidden while the other view is on screen.")]
    public CameraController.View view = CameraController.View.Room;

    private CameraController cameraController;
    private readonly List<Renderer> renderers = new List<Renderer>();
    // Only the lights that were on at the start; lights switched off in the scene stay off
    private readonly List<Light> lights = new List<Light>();
    private bool shown = true;

    // True while the camera shows this object's view
    public bool IsShown
    {
        get
        {
            if (cameraController == null)
            {
                cameraController = FindAnyObjectByType<CameraController>();
            }

            return cameraController == null || cameraController.ShownView == view;
        }
    }

    private void Awake()
    {
        foreach (Renderer r in GetComponentsInChildren<Renderer>(true))
        {
            if (r.GetComponent<WaterHeight>() == null)
            {
                renderers.Add(r);
            }
        }

        foreach (Light l in GetComponentsInChildren<Light>(true))
        {
            if (l.enabled)
            {
                lights.Add(l);
            }
        }
    }

    private void LateUpdate()
    {
        bool show = IsShown;
        if (show == shown)
        {
            return;
        }

        shown = show;
        foreach (Renderer r in renderers)
        {
            if (r != null)
            {
                r.forceRenderingOff = !show;
            }
        }

        foreach (Light l in lights)
        {
            if (l != null)
            {
                l.enabled = show;
            }
        }
    }
}
