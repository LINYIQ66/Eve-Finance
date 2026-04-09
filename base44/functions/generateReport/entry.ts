import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { reportType, startDate, endDate, groupBy } = await req.json();

    const start = new Date(startDate || Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = new Date(endDate || Date.now());

    let reportData = {};

    if (reportType === 'user_activity' || reportType === 'all') {
      const users = await base44.asServiceRole.entities.User.list("-created_date", 1000);
      const usersByDate = {};
      
      users.forEach(user => {
        const date = new Date(user.created_date).toISOString().split('T')[0];
        usersByDate[date] = (usersByDate[date] || 0) + 1;
      });

      const userGrowth = Object.entries(usersByDate)
        .map(([date, count]) => ({ date, count }))
        .filter(item => new Date(item.date) >= start && new Date(item.date) <= end)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      const kycStatus = users.reduce((acc, user) => {
        const status = user.kyc_status || 'not_started';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      reportData.user_activity = {
        total_users: users.length,
        user_growth: userGrowth,
        kyc_distribution: kycStatus,
        new_users_this_month: users.filter(u => {
          const created = new Date(u.created_date);
          const now = new Date();
          return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
        }).length
      };
    }

    if (reportType === 'transaction_history' || reportType === 'all') {
      const transactions = await base44.asServiceRole.entities.Transaction.list("-created_date", 5000);
      
      const filteredTransactions = transactions.filter(t => {
        const date = new Date(t.created_date);
        return date >= start && date <= end;
      });

      const volumeByDate = {};
      const volumeByType = {};
      const volumeByAsset = {};

      filteredTransactions.forEach(t => {
        const date = new Date(t.created_date).toISOString().split('T')[0];
        volumeByDate[date] = (volumeByDate[date] || 0) + (t.amount_usd || 0);
        
        const type = t.transaction_type || 'unknown';
        volumeByType[type] = (volumeByType[type] || 0) + (t.amount_usd || 0);
        
        const asset = t.from_asset || t.asset || 'unknown';
        volumeByAsset[asset] = (volumeByAsset[asset] || 0) + (t.amount_usd || 0);
      });

      const tradingVolume = Object.entries(volumeByDate)
        .map(([date, volume]) => ({ date, volume }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      reportData.transaction_history = {
        total_transactions: filteredTransactions.length,
        total_volume: filteredTransactions.reduce((sum, t) => sum + (t.amount_usd || 0), 0),
        total_fees: filteredTransactions.reduce((sum, t) => sum + (t.fee_usd || 0), 0),
        trading_volume: tradingVolume,
        volume_by_type: volumeByType,
        volume_by_asset: volumeByAsset,
        transactions: filteredTransactions
      };
    }

    if (reportType === 'fund_requests' || reportType === 'all') {
      const fundRequests = await base44.asServiceRole.entities.FundRequest.list("-created_date", 2000);
      
      const filteredRequests = fundRequests.filter(r => {
        const date = new Date(r.created_date);
        return date >= start && date <= end;
      });

      const requestsByStatus = filteredRequests.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});

      const requestsByType = filteredRequests.reduce((acc, r) => {
        acc[r.request_type] = (acc[r.request_type] || 0) + 1;
        return acc;
      }, {});

      const requestsByMethod = filteredRequests.reduce((acc, r) => {
        acc[r.method] = (acc[r.method] || 0) + 1;
        return acc;
      }, {});

      reportData.fund_requests = {
        total_requests: filteredRequests.length,
        total_amount: filteredRequests.reduce((sum, r) => sum + (r.amount || 0), 0),
        by_status: requestsByStatus,
        by_type: requestsByType,
        by_method: requestsByMethod,
        pending_amount: filteredRequests.filter(r => r.status === 'pending').reduce((sum, r) => sum + (r.amount || 0), 0),
        requests: filteredRequests
      };
    }

    if (reportType === 'system_performance' || reportType === 'all') {
      const transactions = await base44.asServiceRole.entities.Transaction.list("-created_date", 5000);
      const loans = await base44.asServiceRole.entities.Loan.list("-created_date", 1000);
      const redemptions = await base44.asServiceRole.entities.PhysicalRedemption.list("-created_date", 1000);
      
      const filteredTransactions = transactions.filter(t => {
        const date = new Date(t.created_date);
        return date >= start && date <= end;
      });

      const dailyStats = {};
      filteredTransactions.forEach(t => {
        const date = new Date(t.created_date).toISOString().split('T')[0];
        if (!dailyStats[date]) {
          dailyStats[date] = { count: 0, volume: 0, fees: 0 };
        }
        dailyStats[date].count += 1;
        dailyStats[date].volume += (t.amount_usd || 0);
        dailyStats[date].fees += (t.fee_usd || 0);
      });

      const performance = Object.entries(dailyStats)
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      const activeLoans = loans.filter(l => l.status === 'active');
      const totalCollateral = activeLoans.reduce((sum, l) => sum + (l.collateral_amount || 0), 0);
      const totalLoaned = activeLoans.reduce((sum, l) => sum + (l.loan_amount || 0), 0);

      reportData.system_performance = {
        daily_performance: performance,
        avg_daily_volume: performance.reduce((sum, p) => sum + p.volume, 0) / (performance.length || 1),
        avg_daily_transactions: performance.reduce((sum, p) => sum + p.count, 0) / (performance.length || 1),
        total_loans_value: totalLoaned,
        total_collateral_value: totalCollateral,
        active_loans_count: activeLoans.length,
        total_redemptions: redemptions.length,
        pending_redemptions: redemptions.filter(r => r.status === 'processing').length
      };
    }

    return Response.json({
      success: true,
      data: reportData,
      generated_at: new Date().toISOString(),
      period: { start: start.toISOString(), end: end.toISOString() }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});