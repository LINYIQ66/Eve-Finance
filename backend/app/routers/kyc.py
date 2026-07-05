"""KYC submission and status router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import User
from app.schemas import KYCSubmit, KYCStatusOut
from app.auth import get_current_user

router = APIRouter(prefix="/api/kyc", tags=["kyc"])


@router.post("/submit", response_model=KYCStatusOut)
async def submit_kyc(
    body: KYCSubmit,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.kyc_status == "approved":
        raise HTTPException(status_code=400, detail="KYC already approved")
    user.kyc_data = {
        "id_number": body.id_number,
        "id_type": body.id_type,
        "address": body.address,
        "document_urls": body.document_urls,
        "full_name": body.full_name or user.full_name,
        "nationality": body.nationality,
        "date_of_birth": body.date_of_birth.isoformat() if body.date_of_birth else None,
        "contact_number": body.contact_number,
        "submitted_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
    user.kyc_status = "pending"
    if body.nationality:
        user.nationality = body.nationality
    if body.date_of_birth:
        user.date_of_birth = body.date_of_birth
    if body.contact_number:
        user.contact_number = body.contact_number
    if body.address:
        user.address = body.address
    await db.commit()
    await db.refresh(user)
    return KYCStatusOut(kyc_status=user.kyc_status, kyc_data=user.kyc_data)


@router.get("/status", response_model=KYCStatusOut)
async def kyc_status(user: User = Depends(get_current_user)):
    return KYCStatusOut(kyc_status=user.kyc_status, kyc_data=user.kyc_data)
