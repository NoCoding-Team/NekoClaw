from fastapi import HTTPException, status


class AppException(HTTPException):
    def __init__(self, status_code: int, error_code: str, message: str):
        super().__init__(status_code=status_code, detail={"error_code": error_code, "message": message})


class NotFoundError(AppException):
    def __init__(self, message: str = "资源不存在"):
        super().__init__(status.HTTP_404_NOT_FOUND, "NOT_FOUND", message)


class ForbiddenError(AppException):
    def __init__(self, message: str = "无权限访问"):
        super().__init__(status.HTTP_403_FORBIDDEN, "FORBIDDEN", message)


class BadRequestError(AppException):
    def __init__(self, message: str = "请求参数错误"):
        super().__init__(status.HTTP_400_BAD_REQUEST, "BAD_REQUEST", message)


class ConflictError(AppException):
    def __init__(self, message: str = "数据冲突"):
        super().__init__(status.HTTP_409_CONFLICT, "CONFLICT", message)


class UnauthorizedError(AppException):
    def __init__(self, message: str = "未登录或登录已过期"):
        super().__init__(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", message)
