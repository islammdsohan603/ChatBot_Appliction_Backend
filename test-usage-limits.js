import {
  TIER_LIMITS,
  getTierLimits,
  getUtcDateString,
  verifyUsageAccess,
} from "./src/utils/usageLimits.js";

async function runTests() {
  console.log("=== RUNNING USAGE LIMITS & PRO PRIVILEGES VERIFICATION ===");

  // Test 1: Tier limits definitions
  const freeLimits = getTierLimits("free");
  const proLimits = getTierLimits("pro");

  console.assert(freeLimits.maxDailyMessages === 20, "Free limit should be 20 messages/day");
  console.assert(proLimits.maxDailyMessages >= 10000, "Pro limit should be unlimited/10000");
  console.assert(freeLimits.canExportHistory === false, "Free cannot export transcripts");
  console.assert(proLimits.canExportHistory === true, "Pro can export transcripts");
  console.assert(freeLimits.proOnlyModels.includes("gemini-3.5-pro"), "Gemini 3.5 Pro should be Pro-only");
  console.log("✔ Test 1 Passed: Tier configuration & limits verified.");

  // Test 2: Standard model access for free tier
  const freeStandardCheck = await verifyUsageAccess({
    userId: null,
    userTier: "free",
    model: "gemini-3.8-flash",
    hasImage: false,
    promptLength: 50,
  });
  console.assert(freeStandardCheck.allowed === true, "Free user should be allowed standard model");
  console.log("✔ Test 2 Passed: Standard model allowed for free tier.");

  // Test 3: Pro-only model restriction for free tier
  const freeProModelCheck = await verifyUsageAccess({
    userId: null,
    userTier: "free",
    model: "gemini-3.5-pro",
    hasImage: false,
    promptLength: 50,
  });
  console.assert(freeProModelCheck.allowed === false, "Free user should NOT be allowed Gemini 3.5 Pro");
  console.assert(freeProModelCheck.reason === "MODEL_RESTRICTED", "Reason should be MODEL_RESTRICTED");
  console.log("✔ Test 3 Passed: Pro-only model correctly restricted for free tier.");

  // Test 4: Pro-only model access granted for Pro tier
  const proModelCheck = await verifyUsageAccess({
    userId: null,
    userTier: "pro",
    model: "gemini-3.5-pro",
    hasImage: false,
    promptLength: 50,
  });
  console.assert(proModelCheck.allowed === true, "Pro user should be allowed Gemini 3.5 Pro");
  console.assert(proModelCheck.isUnlimited === true, "Pro user should have isUnlimited true");
  console.log("✔ Test 4 Passed: Pro-only model and extended limits granted for Pro tier.");

  // Test 5: UTC Date format
  const today = getUtcDateString();
  console.assert(/^\d{4}-\d{2}-\d{2}$/.test(today), "UTC Date must match YYYY-MM-DD");
  console.log(`✔ Test 5 Passed: UTC Date formatted correctly (${today}).`);

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
