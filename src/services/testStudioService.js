import api from "../api/axiosInstance";

export const getTestStudioOptions = async () => {
  try {
    const response = await api.get("/test-studio/options");
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const previewTestAssignment = async (payload) => {
  try {
    const response = await api.post("/test-studio/assignments/preview", payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const getTests = async (params = {}) => {
  try {
    const response = await api.get("/test-studio/tests", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const getTestById = async (id) => {
  try {
    const response = await api.get(`/test-studio/tests/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const getTeacherPaperHeader = async () => {
  try {
    const response = await api.get("/test-studio/paper-header");
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const updateTeacherPaperHeader = async (payload) => {
  try {
    const response = await api.put("/test-studio/paper-header", payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const createTest = async (payload) => {
  try {
    const response = await api.post("/test-studio/tests", payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const updateTest = async (id, payload) => {
  try {
    const response = await api.put(`/test-studio/tests/${id}`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const publishTest = async (id) => {
  try {
    const response = await api.post(`/test-studio/tests/${id}/publish`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const pauseTestTimer = async (id) => {
  try {
    const response = await api.post(`/test-studio/tests/${id}/pause`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const resumeTestTimer = async (id) => {
  try {
    const response = await api.post(`/test-studio/tests/${id}/resume`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const reassignRemainingStudents = async (id, payload) => {
  try {
    const response = await api.post(`/test-studio/tests/${id}/reassign-remaining`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const updateTestPaperHeader = async (id, payload) => {
  try {
    const response = await api.put(`/test-studio/tests/${id}/paper-header`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const duplicateTest = async (id) => {
  try {
    const response = await api.post(`/test-studio/tests/${id}/duplicate`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const deleteTest = async (id) => {
  try {
    const response = await api.delete(`/test-studio/tests/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const getQuestionBank = async (params = {}) => {
  try {
    const response = await api.get("/test-studio/question-bank", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const importQuestionBank = async ({ file, courseId, topic }) => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("courseId", courseId);
    if (topic) formData.append("topic", topic);
    const response = await api.post("/test-studio/question-bank/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const getMyStudentTests = async () => {
  try {
    const response = await api.get("/test-studio/student/tests");
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const startMyStudentTest = async (id) => {
  try {
    const response = await api.post(`/test-studio/student/tests/${id}/start`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const submitMyStudentTest = async (id, payload) => {
  try {
    const response = await api.post(`/test-studio/student/tests/${id}/submit`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};

export const getTestAttempts = async (id) => {
  try {
    const response = await api.get(`/test-studio/tests/${id}/attempts`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Something went wrong" };
  }
};
