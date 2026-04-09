import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, DollarSign, Activity, Download, Calendar, RefreshCw } from "lucide-react";
import { generateReport } from "@/functions/generateReport";
import { motion } from "framer-motion";
import { useLanguage } from "@/components/common/LanguageProvider";

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

const StatCard = ({ title, value, icon: Icon, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-xl shadow-lg p-6"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center`}>
        {Icon && <Icon className="w-6 h-6 text-white" />}
      </div>
    </div>
  </motion.div>
);

export default function AnalyticsReport() {
  const { t } = useLanguage();
  const [reportType, setReportType] = useState("all");
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await generateReport({
        reportType,
        startDate,
        endDate
      });
      if (response.success) {
        setReportData(response.data);
      }
    } catch (error) {
      console.error("Error fetching report:", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handleExport = () => {
    if (!reportData) return;
    const dataStr = JSON.stringify(reportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${reportType}_${startDate}_to_${endDate}.json`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reports</SelectItem>
                  <SelectItem value="user_activity">User Activity</SelectItem>
                  <SelectItem value="transaction_history">Transactions</SelectItem>
                  <SelectItem value="fund_requests">Fund Requests</SelectItem>
                  <SelectItem value="system_performance">System Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Start Date</Label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            
            <div>
              <Label>End Date</Label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            
            <div className="flex items-end gap-2">
              <Button 
                onClick={fetchReport} 
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Generate
              </Button>
              <Button 
                onClick={handleExport} 
                disabled={!reportData}
                variant="outline"
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {!reportData && !isLoading && (
        <div className="text-center py-12">
          <Activity className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Report Data</h3>
          <p className="text-slate-600">Click "Generate" to create a report</p>
        </div>
      )}

      {reportData && (
        <div className="space-y-8">
          {/* User Activity */}
          {(reportType === 'all' || reportType === 'user_activity') && reportData.user_activity && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">User Activity</h3>
              <div className="grid md:grid-cols-4 gap-6 mb-6">
                <StatCard 
                  title="Total Users" 
                  value={reportData.user_activity.total_users} 
                  icon={Users} 
                  color="bg-blue-600"
                />
                <StatCard 
                  title="New This Month" 
                  value={reportData.user_activity.new_users_this_month} 
                  icon={TrendingUp} 
                  color="bg-green-600"
                />
                <StatCard 
                  title="Approved KYC" 
                  value={reportData.user_activity.kyc_distribution.approved || 0} 
                  icon={Activity} 
                  color="bg-purple-600"
                />
                <StatCard 
                  title="Pending KYC" 
                  value={reportData.user_activity.kyc_distribution.pending || 0} 
                  icon={Calendar} 
                  color="bg-orange-600"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>User Growth Over Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={reportData.user_activity.user_growth}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="count" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>KYC Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={Object.entries(reportData.user_activity.kyc_distribution).map(([name, value]) => ({ name, value }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {Object.entries(reportData.user_activity.kyc_distribution).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {/* Transaction History */}
          {(reportType === 'all' || reportType === 'transaction_history') && reportData.transaction_history && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Transaction History</h3>
              <div className="grid md:grid-cols-4 gap-6 mb-6">
                <StatCard 
                  title="Total Transactions" 
                  value={reportData.transaction_history.total_transactions} 
                  icon={Activity} 
                  color="bg-blue-600"
                />
                <StatCard 
                  title="Total Volume" 
                  value={`$${reportData.transaction_history.total_volume.toFixed(2)}`} 
                  icon={DollarSign} 
                  color="bg-green-600"
                />
                <StatCard 
                  title="Total Fees" 
                  value={`$${reportData.transaction_history.total_fees.toFixed(2)}`} 
                  icon={TrendingUp} 
                  color="bg-purple-600"
                />
                <StatCard 
                  title="Avg per Transaction" 
                  value={`$${(reportData.transaction_history.total_volume / (reportData.transaction_history.total_transactions || 1)).toFixed(2)}`} 
                  icon={Users} 
                  color="bg-orange-600"
                />
              </div>

              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg mb-6">
                <CardHeader>
                  <CardTitle>Trading Volume Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={reportData.transaction_history.trading_volume}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="volume" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-6">
                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Volume by Transaction Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={Object.entries(reportData.transaction_history.volume_by_type).map(([name, value]) => ({ name, value }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {Object.entries(reportData.transaction_history.volume_by_type).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Volume by Asset</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={Object.entries(reportData.transaction_history.volume_by_asset).map(([name, value]) => ({ name, value }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#10B981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {/* Fund Requests */}
          {(reportType === 'all' || reportType === 'fund_requests') && reportData.fund_requests && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Fund Requests</h3>
              <div className="grid md:grid-cols-4 gap-6 mb-6">
                <StatCard 
                  title="Total Requests" 
                  value={reportData.fund_requests.total_requests} 
                  icon={Activity} 
                  color="bg-blue-600"
                />
                <StatCard 
                  title="Total Amount" 
                  value={`$${reportData.fund_requests.total_amount.toFixed(2)}`} 
                  icon={DollarSign} 
                  color="bg-green-600"
                />
                <StatCard 
                  title="Pending Amount" 
                  value={`$${reportData.fund_requests.pending_amount.toFixed(2)}`} 
                  icon={Calendar} 
                  color="bg-orange-600"
                />
                <StatCard 
                  title="Avg Request Size" 
                  value={`$${(reportData.fund_requests.total_amount / (reportData.fund_requests.total_requests || 1)).toFixed(2)}`} 
                  icon={TrendingUp} 
                  color="bg-purple-600"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Requests by Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={Object.entries(reportData.fund_requests.by_status).map(([name, value]) => ({ name, value }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {Object.entries(reportData.fund_requests.by_status).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Requests by Method</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={Object.entries(reportData.fund_requests.by_method).map(([name, value]) => ({ name, value }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#8B5CF6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {/* System Performance */}
          {(reportType === 'all' || reportType === 'system_performance') && reportData.system_performance && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">System Performance</h3>
              <div className="grid md:grid-cols-4 gap-6 mb-6">
                <StatCard 
                  title="Avg Daily Volume" 
                  value={`$${reportData.system_performance.avg_daily_volume.toFixed(2)}`} 
                  icon={DollarSign} 
                  color="bg-blue-600"
                />
                <StatCard 
                  title="Avg Daily Transactions" 
                  value={reportData.system_performance.avg_daily_transactions.toFixed(1)} 
                  icon={Activity} 
                  color="bg-green-600"
                />
                <StatCard 
                  title="Active Loans" 
                  value={reportData.system_performance.active_loans_count} 
                  icon={TrendingUp} 
                  color="bg-purple-600"
                />
                <StatCard 
                  title="Total Collateral" 
                  value={`$${reportData.system_performance.total_collateral_value.toFixed(2)}`} 
                  icon={Users} 
                  color="bg-orange-600"
                />
              </div>

              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Daily Performance Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={reportData.system_performance.daily_performance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="volume" stroke="#3B82F6" name="Volume" />
                      <Line yAxisId="right" type="monotone" dataKey="count" stroke="#10B981" name="Transactions" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}