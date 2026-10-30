using UnityEngine;

[ExecuteAlways]
[RequireComponent(typeof(MeshFilter))]
public class DynamicPlane : MonoBehaviour
{
    [Min(2)]
    public int gridSize = 10;

    private Mesh mesh;

    // Runs in edit mode too (ExecuteAlways). The mesh is DontSave, so it's never written into the scene and is rebuilt on load.
    private void OnEnable()
    {
        mesh = new Mesh { name = "DynamicPlane", hideFlags = HideFlags.DontSave };
        BuildMesh();
        GetComponent<MeshFilter>().sharedMesh = mesh;
    }

    private void OnDisable()
    {
        if (Application.isPlaying)
        {
            Destroy(mesh);
        }
        else
        {
            DestroyImmediate(mesh);
        }
        mesh = null;
    }

    // Rebuild in place when gridSize changes in the inspector. Reassigning the MeshFilter here would make Unity warn.
    private void OnValidate()
    {
        if (mesh != null)
        {
            BuildMesh();
        }
    }

    // Plane in local space: X and Z from -0.5 to 0.5 at Y = 0, facing +Y. The transform sets its size in the world.
    private void BuildMesh()
    {
        int vertexCount = gridSize * gridSize;
        var vertices = new Vector3[vertexCount];
        var normals = new Vector3[vertexCount];
        var uvs = new Vector2[vertexCount];

        for (int y = 0; y < gridSize; y++)
        {
            for (int x = 0; x < gridSize; x++)
            {
                int i = y * gridSize + x;
                var uv = new Vector2(x / (float)(gridSize - 1), y / (float)(gridSize - 1));
                vertices[i] = new Vector3(uv.x - 0.5f, 0f, uv.y - 0.5f);
                normals[i] = Vector3.up;
                uvs[i] = uv;
            }
        }

        int cells = gridSize - 1;
        var triangles = new int[cells * cells * 6];
        int t = 0;
        for (int y = 0; y < cells; y++)
        {
            for (int x = 0; x < cells; x++)
            {
                int i = y * gridSize + x;
                // Clockwise when seen from above, so the front face is on the normal's side
                triangles[t++] = i;
                triangles[t++] = i + gridSize;
                triangles[t++] = i + 1;
                triangles[t++] = i + 1;
                triangles[t++] = i + gridSize;
                triangles[t++] = i + gridSize + 1;
            }
        }

        mesh.Clear();
        mesh.indexFormat = vertexCount > 65535
            ? UnityEngine.Rendering.IndexFormat.UInt32
            : UnityEngine.Rendering.IndexFormat.UInt16;
        mesh.vertices = vertices;
        mesh.normals = normals;
        mesh.uv = uvs;
        mesh.triangles = triangles;
        // Tangent-space normals (NormalTS in the Water shader) need tangents that follow the UVs
        mesh.RecalculateTangents();
        mesh.RecalculateBounds();
    }
}
