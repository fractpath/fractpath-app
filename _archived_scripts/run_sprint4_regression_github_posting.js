import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// GitHub config
const REPO_OWNER = "your-github-username-or-org";
const REPO_NAME = "fractpath";
const ISSUE_NUMBER = 123; // replace with your GitHub ticket number

// Function to post a comment to GitHub ticket
async function postToGitHub(comment) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ body: comment }),
    },
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  console.log("✅ Comment posted to GitHub");
}

// Run the regression via Supabase RPC
async function runRegression() {
  try {
    const { data, error } = await supabase.rpc("run_sprint4_regression");

    if (error) throw error;
    console.log("✅ RPC regression executed");

    // Fetch latest regression run from table
    const { data: latestRun } = await supabase
      .from("regression_runs")
      .select("*")
      .eq("name", "sprint4_homeowner_authorize_counter")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Prepare comment
    const comment = latestRun.passed
      ? `✅ Sprint 4 regression passed.\nDetails: ${JSON.stringify(latestRun.details)}`
      : `❌ Sprint 4 regression failed!\nDetails: ${JSON.stringify(latestRun.details)}`;

    await postToGitHub(comment);
  } catch (err) {
    console.error("Regression run failed:", err);
    process.exit(1);
  }
}

runRegression();
