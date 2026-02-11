if (dealErr || !dealRow?.id) {
  console.error("NEW_DEAL_CREATE_FAILED", {
    message: dealErr?.message,
    code: (dealErr as any)?.code,
    details: (dealErr as any)?.details,
    hint: (dealErr as any)?.hint,
  });

  const errorCode = encodeURIComponent(
    ((dealErr as any)?.code as string) || "unknown",
  );

  redirect(`/dashboard?create=failed&code=${errorCode}`);
}
