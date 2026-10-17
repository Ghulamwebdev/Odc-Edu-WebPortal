import api from "../api/axiosInstance";

export const getStudentPortalAccounts = async () => {
  try {
    const response = await api.get("/user/student-portal-accounts");
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const deleteAllStudentPortalAccounts = async () => {
  try {
    const response = await api.delete("/user/student-portal-accounts");
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const previewStudentPortalAccounts = async (payload) => {
  try {
    const response = await api.post("/user/student-portal-accounts/preview", payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const createStudentPortalAccounts = async (payload) => {
  try {
    const response = await api.post("/user/student-portal-accounts/bulk", payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const updateStudentPortalAccountStatus = async (id, isActive) => {
  try {
    const response = await api.patch(`/user/student-portal-accounts/${id}/status`, { isActive });
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};
