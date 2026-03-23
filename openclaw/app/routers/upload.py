import io
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename or ""
    text = ""

    if filename.endswith(".txt") or filename.endswith(".md"):
        text = content.decode("utf-8", errors="replace")

    elif filename.endswith(".pdf"):
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=content, filetype="pdf")
            text = "\n".join(page.get_text() for page in doc)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"PDF parse error: {e}")

    elif filename.endswith(".csv"):
        text = content.decode("utf-8", errors="replace")

    else:
        raise HTTPException(status_code=415, detail="Unsupported file type. Use .txt, .pdf, or .csv")

    return {"filename": filename, "text": text[:50000]}  # cap at 50k chars
