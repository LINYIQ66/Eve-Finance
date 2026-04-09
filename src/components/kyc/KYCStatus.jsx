import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function KYCStatus({ user, isLoading }) {
  const getStatusIcon = (status) => {
    switch (status) {
      case "approved":
        return CheckCircle;
      case "pending":
        return Clock;
      case "rejected":
        return XCircle;
      default:
        return AlertCircle;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-800 border-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "rejected":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case "approved":
        return "Your identity has been verified successfully. You now have access to all platform features.";
      case "pending":
        return "Your documents are being reviewed by our compliance team. This typically takes 1-2 business days.";
      case "rejected":
        return "Your KYC application was rejected. Please review the notes below and resubmit with correct documents.";
      default:
        return "Please complete your KYC verification to access all trading features.";
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
        <CardContent className="p-8">
          <div className="flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = user?.kyc_status || "not_started";
  const StatusIcon = getStatusIcon(status);

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
          <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            status === "approved" ? "bg-green-100" :
            status === "pending" ? "bg-yellow-100" :
            status === "rejected" ? "bg-red-100" : "bg-gray-100"
          }`}>
            <StatusIcon className={`w-7 h-7 md:w-8 md:h-8 ${
              status === "approved" ? "text-green-600" :
              status === "pending" ? "text-yellow-600" :
              status === "rejected" ? "text-red-600" : "text-gray-600"
            }`} />
          </div>
          
          <div className="flex-1 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-2 md:mb-3">
              <h2 className="text-xl md:text-2xl font-bold text-slate-900">Verification Status</h2>
              <Badge className={`px-2 py-0.5 md:px-3 md:py-1 text-xs md:text-sm ${getStatusColor(status)} border`}>
                {status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            
            <p className="text-sm md:text-base text-slate-600 leading-relaxed mb-3 md:mb-4">
              {getStatusMessage(status)}
            </p>
            
            {user?.kyc_notes && (
              <div className="bg-slate-50 p-3 md:p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-1 md:mb-2 text-sm md:text-base">Review Notes:</h4>
                <p className="text-sm md:text-base text-slate-700">{user.kyc_notes}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}