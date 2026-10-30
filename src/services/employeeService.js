import api from "../api/axiosInstance";

const toFormData = (payload = {}) => {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === "courseIds") {
      formData.append(key, JSON.stringify(value || []));
    } else if (key === "attendanceBatchIds") {
      formData.append(key, JSON.stringify(value || []));
    } else if (key === "permissions") {
      formData.append(key, JSON.stringify(value || []));
    } else if (key === "profile" && Array.isArray(value) && value[0]?.originFileObj) {
      formData.append(key, value[0].originFileObj);
    } else if (key === "profile" && value?.originFileObj) {
      formData.append(key, value.originFileObj);
    } else if (key !== "profile") {
      formData.append(key, value);
    }
  });
  return formData;
};

const multipartConfig = {
  headers: { "Content-Type": "multipart/form-data" },
};

export const ensureEmployeeRole = async () => {
  try {
    const response = await api.get("/employees/role");
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const getEmployees = async () => {
  try {
    const response = await api.get("/employees");
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const createEmployee = async (payload) => {
  try {
    const response = await api.post("/employees", toFormData(payload), multipartConfig);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const updateEmployee = async (id, payload) => {
  try {
    const response = await api.put(`/employees/${id}`, toFormData(payload), multipartConfig);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const updateEmployeeStatus = async (id, isActive) => {
  try {
    const response = await api.patch(`/employees/${id}/status`, { isActive });
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const updateEmployeeModuleAccess = async (id, enabled) => {
  try {
    const response = await api.patch(`/employees/${id}/employee-module-access`, { enabled });
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const deleteEmployee = async (id) => {
  try {
    const response = await api.delete(`/employees/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const getEmployeeDashboard = async () => {
  try {
    const response = await api.get("/employees/me/dashboard");
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const updateMyEmployeeProfile = async (payload) => {
  try {
    const response = await api.put("/employees/me/profile", toFormData(payload), multipartConfig);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const changeMyEmployeePassword = async (payload) => {
  try {
    const response = await api.put("/employees/me/password", payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};
