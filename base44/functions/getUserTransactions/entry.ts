import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all transactions for this user using service role to bypass RLS quirks
    // Matches both user_email and created_by fields
    const [byEmail, byCreator] = await Promise.all([
      base44.asServiceRole.entities.Transaction.filter({ user_email: user.email }, "-created_date", 500),
      base44.asServiceRole.entities.Transaction.filter({ created_by: user.email }, "-created_date", 500),
    ]);

    // Merge and deduplicate by id
    const txMap = new Map();
    [...byEmail, ...byCreator].forEach(tx => txMap.set(tx.id, tx));
    const transactions = Array.from(txMap.values())
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    return Response.json({ transactions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});