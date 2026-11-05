using System.IO;
using UnityEditor;
using UnityEditor.Build.Profile;
using UnityEditor.Build.Reporting;
using UnityEngine;

// Builds the web players straight into the web app (app/public/, not in git), where
// app/scripts/upload-woonkamer.sh packs them for the deploy:
//   Web - Desktop - Release -> app/public/woonkamer-desktop/
//   Web - Mobile - Release  -> app/public/woonkamer-mobile/
// The app picks one at runtime (app/components/UnityRoom.tsx).
// Note: building with a profile makes it the active one, so afterwards the last built profile is active
// (Web - Mobile - Release after building both). Switch back in the Build Profiles window if needed.
public static class WebBuilds
{
    private const string ProfileFolder = "Assets/Settings/Build Profiles/";

    [MenuItem("Droge Voeten/Build web players (desktop + mobile)")]
    private static void BuildBoth()
    {
        if (Build("Web - Desktop - Release", "woonkamer-desktop"))
        {
            Build("Web - Mobile - Release", "woonkamer-mobile");
        }
    }

    [MenuItem("Droge Voeten/Build web player (desktop only)")]
    private static void BuildDesktop() => Build("Web - Desktop - Release", "woonkamer-desktop");

    [MenuItem("Droge Voeten/Build web player (mobile only)")]
    private static void BuildMobile() => Build("Web - Mobile - Release", "woonkamer-mobile");

    // Builds one profile into app/public/<folder>/, replacing what was there. True on success.
    private static bool Build(string profileName, string folder)
    {
        var profile = AssetDatabase.LoadAssetAtPath<BuildProfile>(ProfileFolder + profileName + ".asset");
        if (profile == null)
        {
            EditorUtility.DisplayDialog("Web build", $"Build profile '{profileName}' not found in {ProfileFolder}.", "OK");
            return false;
        }

        // Assets/ -> project -> unity/ -> repository root
        string repo = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", ".."));
        string publicDir = Path.Combine(repo, "app", "public");
        if (!Directory.Exists(publicDir))
        {
            EditorUtility.DisplayDialog("Web build", $"Web app not found: {publicDir}", "OK");
            return false;
        }

        // Start from an empty folder, so no files of an earlier build stay behind
        string output = Path.Combine(publicDir, folder);
        if (Directory.Exists(output))
        {
            Directory.Delete(output, true);
        }

        BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerWithProfileOptions
        {
            buildProfile = profile,
            locationPathName = output,
            options = BuildOptions.None,
        });

        BuildSummary summary = report.summary;
        if (summary.result != BuildResult.Succeeded)
        {
            EditorUtility.DisplayDialog("Web build", $"{profileName} failed ({summary.result}, {summary.totalErrors} errors). See the Console.", "OK");
            return false;
        }

        Debug.Log($"[WebBuilds] {profileName} -> {output} ({summary.totalSize / (1024f * 1024f):0.0} MB, {summary.totalTime:mm\\:ss})");
        return true;
    }
}
