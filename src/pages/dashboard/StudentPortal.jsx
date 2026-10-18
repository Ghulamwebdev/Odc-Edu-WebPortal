import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
  message,
} from "antd";
import {
  BookOutlined,
  EyeOutlined,
  LockOutlined,
  LogoutOutlined,
  SaveOutlined,
  SendOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { FaSearch, FaCog } from "react-icons/fa";
import { TbArrowsMaximize } from "react-icons/tb";
import dayjs from "dayjs";
import { getAdminInformation, updateAdminInfo } from "../../services/adminService";
import {
  getMyStudentTests,
  getMyStudentTestReview,
  startMyStudentTest,
  submitMyStudentTest,
} from "../../services/testStudioService";
import useZustandStore from "../../stores/zustandStore";
import { getSidebarLogo } from "../../utils/branding";

const getProfileImageSrc = (profile) => {
  const rawProfile = String(profile || "").trim();
  if (!rawProfile) return null;
  if (rawProfile.startsWith("http") || rawProfile.startsWith("data:image")) return rawProfile;
  return `data:image/png;base64,${rawProfile}`;
};

const StudentPortal = () => {
  const navigate = useNavigate();
  const { adminInfo, setAdminInfo, clearToken, appSettings } = useZustandStore();
  const [activeTab, setActiveTab] = useState("student-info");
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [selectedCourseInfo, setSelectedCourseInfo] = useState(null);
  const [studentTests, setStudentTests] = useState([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [studentTestsView, setStudentTestsView] = useState("upcoming");
  const [completedTestReview, setCompletedTestReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [activePaper, setActivePaper] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [securityWarningCount, setSecurityWarningCount] = useState(0);
  const [submittingTest, setSubmittingTest] = useState(false);
  const [nowTick, setNowTick] = useState(dayjs());
  const activePaperRef = useRef(null);
  const submitTestRef = useRef(null);
  const securityWarningCountRef = useRef(0);
  const autoSubmitTriggeredRef = useRef(false);
  const submissionInProgressRef = useRef(false);
  const user = adminInfo?.userData;
  const profileImage = getProfileImageSrc(user?.profile);

  const assignedCourses = useMemo(() => user?.studentPortal?.courses || [], [user]);
  const assignedBatches = useMemo(() => user?.studentPortal?.batches || [], [user]);

  useEffect(() => {
    profileForm.setFieldsValue({
      name: user?.name,
      email: user?.email,
      phone: user?.details?.phone || user?.studentInfo?.mobileNumber,
      city: user?.details?.city,
      address:
        user?.details?.address ||
        user?.studentInfo?.currentAddress ||
        user?.studentInfo?.permanentAddress,
    });
  }, [profileForm, user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(dayjs()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadStudentTests = async () => {
    setTestsLoading(true);
    try {
      const response = await getMyStudentTests();
      setStudentTests(response.data || []);
    } catch (error) {
      message.error(error.message || "Failed to load tests");
    } finally {
      setTestsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "student-tests") {
      loadStudentTests();
    }
  }, [activeTab]);

  const refreshProfile = async () => {
    if (!user?._id) return;
    const response = await getAdminInformation(user._id);
    setAdminInfo(response);
  };

  const logout = () => {
    clearToken();
    localStorage.clear();
    navigate("/login", { replace: true });
  };

  const saveProfile = async (values) => {
    setSavingProfile(true);
    try {
      const formData = new FormData();
      formData.append("name", values.name || "");
      formData.append("email", values.email || user.email);
      formData.append("phone", values.phone || "");
      formData.append("city", values.city || "");
      formData.append("address", values.address || "");
      const file = values.profile?.fileList?.[0]?.originFileObj;
      if (file) formData.append("profile", file);
      await updateAdminInfo(user._id, formData);
      await refreshProfile();
      message.success("Profile updated successfully");
    } catch (error) {
      message.error(error.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (values) => {
    setSavingPassword(true);
    try {
      const formData = new FormData();
      formData.append("name", user.name || "");
      formData.append("email", user.email || "");
      formData.append("password", values.password);
      await updateAdminInfo(user._id, formData);
      passwordForm.resetFields();
      await refreshProfile();
      message.success("Password updated successfully");
    } catch (error) {
      message.error(error.message || "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  };

  const getRemainingMs = (dateValue) => {
    if (!dateValue) return 0;
    return Math.max(0, dayjs(dateValue).diff(nowTick));
  };

  const formatDuration = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  };

  const startTest = async (test) => {
    try {
      const requireFullScreen =
        test.settings?.antiCheating?.requireFullScreen === true;
      if (requireFullScreen && !document.fullscreenElement) {
        if (!document.documentElement.requestFullscreen) {
          message.error("This browser does not support the required full-screen mode.");
          return;
        }
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          message.error("Full-screen mode is required to start this test. Please allow it and try again.");
          return;
        }
      }

      autoSubmitTriggeredRef.current = false;
      securityWarningCountRef.current = 0;
      setSecurityWarningCount(0);
      const response = await startMyStudentTest(test._id);
      const paper = response.data?.test || null;
      const questionById = new Map(
        (paper?.questions || []).map((question) => [String(question._id), question]),
      );
      const restoredAnswers = (response.data?.attempt?.answers || []).reduce(
        (result, answer) => {
          const question = questionById.get(String(answer.questionId));
          result[answer.questionId] =
            question?.questionType === "mcq_multiple"
              ? answer.selectedOptions || []
              : answer.selectedOptions?.length
                ? answer.selectedOptions[0]
                : answer.textAnswer || "";
          return result;
        },
        {},
      );
      setActivePaper(paper);
      setAnswers(restoredAnswers);
      setActiveQuestionIndex(0);
    } catch (error) {
      if (!activePaperRef.current && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch((fullscreenError) => {
          console.error("Could not exit full-screen after test start failed", fullscreenError);
        });
      }
      message.error(error.message || "Failed to start test");
    }
  };

  const submitTest = async (auto = false, autoSubmitReason = "time") => {
    if (!activePaper?._id || submissionInProgressRef.current) return;
    submissionInProgressRef.current = true;
    setSubmittingTest(true);
    try {
      const payload = {
        autoSubmitted: auto,
        answers: (activePaper.questions || []).map((question) => ({
          questionId: question._id,
          selectedOptions: Array.isArray(answers[question._id])
            ? answers[question._id]
            : answers[question._id]
              ? [answers[question._id]]
              : [],
          textAnswer: typeof answers[question._id] === "string" ? answers[question._id] : "",
        })),
      };
      const response = await submitMyStudentTest(activePaper._id, payload);
      message.success(
        auto
          ? autoSubmitReason === "security"
            ? "Test auto-submitted after security violations."
            : "Time ended. Test auto-submitted."
          : "Test submitted successfully",
      );
      if (response.data?.resultVisible || activePaper.settings?.allowReview) {
        Modal.info({
          title: response.data?.resultVisible ? "Test Result" : "Test Submitted",
          width: 640,
          content: (
            <div className="space-y-3">
              {response.data?.resultVisible ? (
                <p>
                  Score: {response.data.score || 0} ({response.data.percentage || 0}%).{" "}
                  {response.data.passed ? "Passed" : "Not passed"}
                </p>
              ) : (
                <p>Your result will be available according to your teacher&apos;s result settings.</p>
              )}
              {activePaper.settings?.allowReview ? (
                <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                  {(activePaper.questions || []).map((question, index) => {
                    const answer = answers[question._id];
                    const selectedOptions = Array.isArray(answer)
                      ? answer
                      : answer
                        ? [answer]
                        : [];
                    const answerText = typeof answer === "string" &&
                      !question.options?.some((option) => option._id === answer)
                      ? answer
                      : selectedOptions
                          .map((optionId) =>
                            question.options?.find((option) => option._id === optionId)?.text,
                          )
                          .filter(Boolean)
                          .join(", ");
                    return (
                      <div key={question._id} className="rounded-lg border border-slate-200 p-3">
                        <div className="font-semibold">
                          Q{index + 1}. {question.questionText}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Your answer: {answerText || "No answer"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ),
        });
      }
      setActivePaper(null);
      setAnswers({});
      setActiveQuestionIndex(0);
      activePaperRef.current = null;
      autoSubmitTriggeredRef.current = false;
      if (
        activePaper.settings?.antiCheating?.requireFullScreen &&
        document.fullscreenElement &&
        document.exitFullscreen
      ) {
        document.exitFullscreen().catch((error) => {
          console.error("Could not exit full-screen after test submission", error);
        });
      }
      await loadStudentTests();
    } catch (error) {
      autoSubmitTriggeredRef.current = false;
      message.error(error.message || "Failed to submit test");
    } finally {
      submissionInProgressRef.current = false;
      setSubmittingTest(false);
    }
  };

  activePaperRef.current = activePaper;
  submitTestRef.current = submitTest;

  const recordSecurityViolation = useCallback((reason) => {
    const paper = activePaperRef.current;
    if (!paper || autoSubmitTriggeredRef.current) return;

    const warningCount = securityWarningCountRef.current + 1;
    securityWarningCountRef.current = warningCount;
    setSecurityWarningCount(warningCount);

    const antiCheating = paper.settings?.antiCheating || {};
    const maxWarnings = Math.max(0, Number(antiCheating.maxWarnings ?? 3));
    message.warning(
      `${reason} Warning ${warningCount}${maxWarnings ? ` of ${maxWarnings}` : ""}.`,
    );
    if (antiCheating.autoSubmitOnViolation && warningCount >= maxWarnings) {
      autoSubmitTriggeredRef.current = true;
      message.error("Maximum security warnings reached. Your test is being submitted.");
      submitTestRef.current?.(true, "security");
    }
  }, []);

  useEffect(() => {
    if (!activePaper) return undefined;
    const antiCheating = activePaper.settings?.antiCheating || {};
    const preventClipboard = (event) => event.preventDefault();
    const preventClipboardShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && ["c", "v", "x"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };
    const preventContextMenu = (event) => event.preventDefault();
    const trackTabSwitch = () => {
      if (document.hidden) recordSecurityViolation("Leaving the test tab is not allowed.");
    };
    const trackFullscreenExit = () => {
      if (antiCheating.requireFullScreen && !document.fullscreenElement) {
        recordSecurityViolation("Exiting full-screen mode is not allowed.");
      }
    };

    if (antiCheating.disableCopyPaste) {
      document.addEventListener("copy", preventClipboard);
      document.addEventListener("cut", preventClipboard);
      document.addEventListener("paste", preventClipboard);
      document.addEventListener("keydown", preventClipboardShortcut);
    }
    if (antiCheating.disableRightClick) {
      document.addEventListener("contextmenu", preventContextMenu);
    }
    if (antiCheating.trackTabSwitch) {
      document.addEventListener("visibilitychange", trackTabSwitch);
    }
    if (antiCheating.requireFullScreen) {
      document.addEventListener("fullscreenchange", trackFullscreenExit);
    }

    return () => {
      document.removeEventListener("copy", preventClipboard);
      document.removeEventListener("cut", preventClipboard);
      document.removeEventListener("paste", preventClipboard);
      document.removeEventListener("keydown", preventClipboardShortcut);
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("visibilitychange", trackTabSwitch);
      document.removeEventListener("fullscreenchange", trackFullscreenExit);
    };
  }, [activePaper, recordSecurityViolation]);

  useEffect(() => {
    if (!activePaper?.schedule?.endAt) return;
    if (getRemainingMs(activePaper.schedule.endAt) <= 0) {
      submitTest(true);
    }
  }, [nowTick, activePaper]);

  const profileMenu = {
    items: [
      {
        key: "name",
        disabled: true,
        label: (
          <div className="py-1">
            <div className="font-semibold text-primary">{user?.name || "Student"}</div>
            <div className="max-w-[220px] truncate text-xs text-slate-500">{user?.email}</div>
          </div>
        ),
      },
      { type: "divider" },
      {
        key: "profile",
        icon: <UserOutlined />,
        label: "Profile Information",
        onClick: () => setActiveTab("student-info"),
      },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "Logout",
        onClick: logout,
      },
    ],
  };

  const courseColumns = [
    {
      title: "Course",
      key: "course",
      render: (_, course) => (
        <div>
          <div className="font-semibold text-primary">{course.courseName}</div>
          <div className="text-xs text-slate-500">{course.courseId}</div>
        </div>
      ),
    },
    {
      title: "Category",
      dataIndex: "courseCategory",
      render: (value) => value || "N/A",
    },
    {
      title: "Duration",
      dataIndex: "duration",
      render: (value) => (value ? `${value} month${Number(value) === 1 ? "" : "s"}` : "N/A"),
    },
    {
      title: "Batches",
      key: "batches",
      render: (_, course) => {
        const courseBatches = assignedBatches.filter(
          (batch) => String(batch.course) === String(course._id),
        );
        return courseBatches.length ? (
          <div className="flex flex-wrap gap-1">
            {courseBatches.map((batch) => (
              <Tag key={batch._id} color="cyan">{batch.batchName}</Tag>
            ))}
          </div>
        ) : (
          <span className="text-slate-400">No batch</span>
        );
      },
    },
    {
      title: "Status",
      key: "status",
      render: (_, course) => {
        const courseBatches = assignedBatches.filter(
          (batch) => String(batch.course) === String(course._id),
        );
        const status = courseBatches[0]?.status || "Active";
        return <Tag color={status === "Active" ? "green" : "blue"}>{status}</Tag>;
      },
    },
    {
      title: "Action",
      key: "action",
      render: (_, course) => (
        <Button className="h-9 rounded-lg" onClick={() => setSelectedCourseInfo(course)}>
          View Info
        </Button>
      ),
    },
  ];

  const selectedCourseBatches = selectedCourseInfo
    ? assignedBatches.filter((batch) => String(batch.course) === String(selectedCourseInfo._id))
    : [];

  const renderStudentInfo = () => (
    <div className="space-y-5">
      <div className="rounded-[16px] border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserOutlined className="text-primary" />
          <h2 className="module-title !text-[20px]">Profile Information</h2>
        </div>
        <Form form={profileForm} layout="vertical" onFinish={saveProfile}>
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <Form.Item name="name" label="Full Name" rules={[{ required: true, message: "Name is required" }]}>
              <Input className="form-input" />
            </Form.Item>
            <Form.Item name="email" label="Login Email">
              <Input className="form-input" disabled />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input className="form-input" />
            </Form.Item>
            <Form.Item name="city" label="City">
              <Input className="form-input" />
            </Form.Item>
          </div>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={3} className="rounded-[10px]" />
          </Form.Item>
          <Form.Item name="profile" label="Profile Picture">
            <Upload beforeUpload={() => false} maxCount={1} listType="picture">
              <Button icon={<UploadOutlined />}>Select Picture</Button>
            </Upload>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={savingProfile} icon={<SaveOutlined />} className="h-10 !bg-primary !border-primary">
            Save Profile
          </Button>
        </Form>
      </div>

      <div className="rounded-[16px] border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <LockOutlined className="text-primary" />
          <h2 className="module-title !text-[20px]">Change Password</h2>
        </div>
        <Form form={passwordForm} layout="vertical" onFinish={savePassword}>
          <Form.Item
            name="password"
            label="New Password"
            rules={[{ required: true, message: "Password is required" }, { min: 6, message: "Minimum 6 characters" }]}
          >
            <Input.Password className="form-input password-input" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm Password"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Confirm password is required" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) return Promise.resolve();
                  return Promise.reject(new Error("Passwords do not match"));
                },
              }),
            ]}
          >
            <Input.Password className="form-input password-input" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={savingPassword} icon={<LockOutlined />} className="h-10 !bg-primary !border-primary">
            Update Password
          </Button>
        </Form>
      </div>
    </div>
  );

  const renderAssignedCourses = () => (
    <div className="rounded-[16px] border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <BookOutlined className="text-primary" />
        <h2 className="module-title !text-[20px]">Assigned Courses</h2>
      </div>
      {assignedCourses.length ? (
        <Table
          rowKey="_id"
          dataSource={assignedCourses}
          columns={courseColumns}
          pagination={false}
          scroll={{ x: "max-content" }}
          className="student-portal-table custom-pagination-table"
        />
      ) : (
        <Empty description="No assigned courses found" />
      )}
    </div>
  );

  const renderQuestionInput = (question) => {
    if (question.questionType === "mcq_single" || question.questionType === "true_false") {
      return (
        <Radio.Group
          value={answers[question._id]}
          onChange={(event) => setAnswers((prev) => ({ ...prev, [question._id]: event.target.value }))}
          className="flex flex-col gap-2"
        >
          {(question.options || []).map((option) => (
            <Radio key={option._id} value={option._id}>{option.text}</Radio>
          ))}
        </Radio.Group>
      );
    }

    if (question.questionType === "mcq_multiple") {
      return (
        <Checkbox.Group
          value={answers[question._id] || []}
          onChange={(values) => setAnswers((prev) => ({ ...prev, [question._id]: values }))}
          className="flex flex-col gap-2"
        >
          {(question.options || []).map((option) => (
            <Checkbox key={option._id} value={option._id}>{option.text}</Checkbox>
          ))}
        </Checkbox.Group>
      );
    }

    return (
      <Input.TextArea
        rows={3}
        value={answers[question._id] || ""}
        onChange={(event) => setAnswers((prev) => ({ ...prev, [question._id]: event.target.value }))}
        placeholder="Write your answer"
      />
    );
  };

  const renderTestPaper = () => {
    const paperQuestions = activePaper.questions || [];
    const oneByOne = activePaper.settings?.layout === "one_by_one";
    const visibleQuestions = oneByOne
      ? paperQuestions.slice(activeQuestionIndex, activeQuestionIndex + 1)
      : paperQuestions;
    const isLastQuestion = activeQuestionIndex === paperQuestions.length - 1;

    return (
      <div className="space-y-4">
        <Card className="rounded-[16px]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="module-title !text-[20px]">{activePaper.title}</h2>
              <p className="module-subtitle">{activePaper.instructions || "Answer all questions carefully."}</p>
              {activePaper.attemptsAllowed > 1 ? (
                <p className="mt-1 text-xs text-slate-500">
                  Attempt {activePaper.attemptsUsed || 1} of {activePaper.attemptsAllowed}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activePaper.settings?.antiCheating?.maxWarnings > 0 ? (
                <Tag color={securityWarningCount ? "orange" : "blue"}>
                  Warnings: {securityWarningCount}/{activePaper.settings.antiCheating.maxWarnings}
                </Tag>
              ) : null}
              <Tag color="red" className="!px-3 !py-1 !text-[13px]">
                Time Left: {formatDuration(getRemainingMs(activePaper.schedule?.endAt))}
              </Tag>
            </div>
          </div>
        </Card>

        {visibleQuestions.map((question, visibleIndex) => {
          const index = oneByOne ? activeQuestionIndex : visibleIndex;
          return (
            <Card
              key={question._id}
              className="rounded-[16px]"
              title={`Question ${index + 1} (${question.marks || 0} marks)`}
            >
              <div className="mb-4 text-[15px] font-semibold text-primary">{question.questionText}</div>
              {question.imageUrl ? (
                <img
                  src={question.imageUrl}
                  alt="Question"
                  className="mb-4 max-h-[240px] rounded-lg object-contain"
                />
              ) : null}
              {renderQuestionInput(question)}
            </Card>
          );
        })}

        {oneByOne && paperQuestions.length > 0 ? (
          <div className="flex items-center justify-between">
            <Button
              disabled={activeQuestionIndex === 0 || activePaper.settings?.allowBackNavigation === false}
              onClick={() => setActiveQuestionIndex((index) => Math.max(0, index - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-slate-500">
              Question {activeQuestionIndex + 1} of {paperQuestions.length}
            </span>
            {isLastQuestion ? (
              <span />
            ) : (
              <Button
                type="primary"
                onClick={() =>
                  setActiveQuestionIndex((index) =>
                    Math.min(paperQuestions.length - 1, index + 1),
                  )
                }
                className="!bg-primary !border-primary"
              >
                Next
              </Button>
            )}
          </div>
        ) : null}

        {(!oneByOne || isLastQuestion) ? (
          <div className="flex justify-end">
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submittingTest}
              onClick={() => submitTest(false)}
              className="h-10 !bg-primary !border-primary"
            >
              Submit Test
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  const openCompletedTestReview = async (testId) => {
    setReviewLoading(true);
    try {
      const response = await getMyStudentTestReview(testId);
      setCompletedTestReview(response.data || null);
    } catch (error) {
      message.error(error.message || "Failed to load completed test review");
    } finally {
      setReviewLoading(false);
    }
  };

  const renderStudentTests = () => {
    if (activePaper) return renderTestPaper();

    const completedStatuses = ["submitted", "auto_submitted", "graded", "expired"];
    const completedTests = studentTests.filter((test) =>
      completedStatuses.includes(test.attempt?.status),
    );
    const upcomingTests = studentTests.filter(
      (test) => !completedStatuses.includes(test.attempt?.status) && test.status !== "completed",
    );

    const columns = [
      {
        title: "Test",
        key: "test",
        render: (_, test) => (
          <div>
            <div className="font-semibold text-primary">{test.title}</div>
            <div className="text-xs text-slate-500">{test.course?.courseName || "Course"} {test.topic ? `- ${test.topic}` : ""}</div>
          </div>
        ),
      },
      {
        title: "Teacher",
        key: "teacher",
        render: (_, test) => (
          <div>
            <div className="text-[13px] text-slate-700">{test.teacher?.name || "Teacher"}</div>
            <div className="text-xs text-slate-500">{test.teacher?.email || ""}</div>
          </div>
        ),
      },
      {
        title: "Timing",
        key: "timing",
        render: (_, test) => (
          <div className="text-[12px] text-slate-600">
            <div>{test.schedule?.startAt ? dayjs(test.schedule.startAt).format("DD MMM YYYY, hh:mm A") : "Not set"}</div>
            <div>{test.schedule?.endAt ? dayjs(test.schedule.endAt).format("DD MMM YYYY, hh:mm A") : ""}</div>
          </div>
        ),
      },
      {
        title: "Status",
        key: "status",
        render: (_, test) => {
          if (["submitted", "auto_submitted", "graded"].includes(test.attempt?.status)) return <Tag color="green">Submitted</Tag>;
          if (test.status === "live") return <Tag color="green">Live</Tag>;
          if (test.status === "completed") return <Tag color="purple">Completed</Tag>;
          return <Tag color="blue">Upcoming</Tag>;
        },
      },
      {
        title: "Action",
        key: "action",
        render: (_, test) => {
          if (test.canStart) {
            return (
              <Button
                type="primary"
                className="!bg-primary !border-primary"
                onClick={() => startTest(test)}
              >
                {test.attempt?.status === "in_progress"
                  ? "Resume Test"
                  : test.attempt?.status
                    ? "Try Again"
                    : "Start Paper"}
              </Button>
            );
          }
          if (["submitted", "auto_submitted", "graded"].includes(test.attempt?.status)) {
            return test.resultVisible
              ? <Tag color={test.attempt?.passed ? "green" : "red"}>{test.attempt?.percentage || 0}%</Tag>
              : <Tag color="blue">Submitted</Tag>;
          }
          if (test.status === "scheduled") {
            return <span className="text-xs text-slate-500">Starts in {formatDuration(getRemainingMs(test.schedule?.startAt))}</span>;
          }
          return <span className="text-xs text-slate-400">Not available</span>;
        },
      },
    ];

    const completedColumns = [
      {
        title: "Test",
        key: "test",
        render: (_, test) => (
          <div>
            <div className="font-semibold text-primary">{test.title}</div>
            <div className="text-xs text-slate-500">
              {test.course?.courseName || "Course"} {test.topic ? `- ${test.topic}` : ""}
            </div>
          </div>
        ),
      },
      {
        title: "Submitted",
        dataIndex: ["attempt", "submittedAt"],
        render: (value) => value ? dayjs(value).format("DD MMM YYYY, hh:mm A") : "Completed",
      },
      {
        title: "Questions Answered",
        render: (_, test) =>
          `${test.answeredQuestionCount || 0} / ${test.questionCount || 0}`,
      },
      {
        title: "Unanswered",
        dataIndex: "pendingQuestionCount",
        render: (value) => value || 0,
      },
      {
        title: "Result",
        key: "result",
        render: (_, test) =>
          test.resultVisible
            ? `${test.attempt?.score || 0} marks (${test.attempt?.percentage || 0}%)`
            : <Tag color="blue">Not released</Tag>,
      },
      {
        title: "Action",
        key: "action",
        render: (_, test) => (
          <Button
            icon={<EyeOutlined />}
            loading={reviewLoading}
            onClick={() => openCompletedTestReview(test._id)}
          >
            View Test
          </Button>
        ),
      },
    ];

    return (
      <div className="rounded-[16px] border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SendOutlined className="text-primary" />
            <h2 className="module-title !text-[20px]">My Tests</h2>
          </div>
          <Button className="h-9 rounded-lg" onClick={loadStudentTests}>Refresh</Button>
        </div>
        <Tabs
          activeKey={studentTestsView}
          onChange={setStudentTestsView}
          items={[
            {
              key: "upcoming",
              label: `Upcoming Tests (${upcomingTests.length})`,
              children: upcomingTests.length ? (
                <Table
                  rowKey="_id"
                  loading={testsLoading}
                  dataSource={upcomingTests}
                  columns={columns}
                  pagination={false}
                  scroll={{ x: "max-content" }}
                  className="student-portal-table custom-pagination-table"
                />
              ) : (
                <Empty description={testsLoading ? "Loading tests..." : "No upcoming tests found"} />
              ),
            },
            {
              key: "completed",
              label: `My Completed Tests (${completedTests.length})`,
              children: completedTests.length ? (
                <Table
                  rowKey="_id"
                  loading={testsLoading}
                  dataSource={completedTests}
                  columns={completedColumns}
                  pagination={false}
                  scroll={{ x: "max-content" }}
                  className="student-portal-table custom-pagination-table"
                />
              ) : (
                <Empty description={testsLoading ? "Loading tests..." : "No completed tests yet"} />
              ),
            },
          ]}
        />
        <Modal
          title={completedTestReview?.title || "Completed Test"}
          open={Boolean(completedTestReview) || reviewLoading}
          onCancel={() => setCompletedTestReview(null)}
          footer={null}
          width={900}
          destroyOnClose
        >
          {reviewLoading && !completedTestReview ? (
            <Card loading />
          ) : completedTestReview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card size="small">
                  <div className="text-xs text-slate-500">Total Questions</div>
                  <div className="text-xl font-semibold">{completedTestReview.questionCount}</div>
                </Card>
                <Card size="small">
                  <div className="text-xs text-slate-500">Answered</div>
                  <div className="text-xl font-semibold text-green-700">
                    {completedTestReview.answeredQuestionCount}
                  </div>
                </Card>
                <Card size="small">
                  <div className="text-xs text-slate-500">Unanswered</div>
                  <div className="text-xl font-semibold text-orange-600">
                    {completedTestReview.pendingQuestionCount}
                  </div>
                </Card>
                <Card size="small">
                  <div className="text-xs text-slate-500">Result</div>
                  <div className="text-xl font-semibold">
                    {completedTestReview.resultVisible
                      ? `${completedTestReview.score || 0} / ${completedTestReview.totalMarks || 0}`
                      : "Not released"}
                  </div>
                </Card>
              </div>
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                {completedTestReview.questions.map((question, index) => (
                  <Card
                    key={question._id}
                    size="small"
                    title={`Question ${index + 1} · ${question.marks || 0} marks`}
                    extra={
                      <Tag color={question.answered ? "green" : "orange"}>
                        {question.answered ? "Answered" : "Unanswered"}
                      </Tag>
                    }
                  >
                    <div className="mb-3 font-semibold text-primary">{question.questionText}</div>
                    {question.imageUrl ? (
                      <img
                        src={question.imageUrl}
                        alt={`Question ${index + 1}`}
                        className="mb-3 max-h-[220px] rounded-lg object-contain"
                      />
                    ) : null}
                    {question.options?.length ? (
                      <div className="space-y-2">
                        {question.options.map((option) => (
                          <div
                            key={option._id}
                            className={`rounded-lg border px-3 py-2 ${
                              option.selected
                                ? "border-blue-400 bg-blue-50"
                                : "border-slate-200"
                            }`}
                          >
                            {question.questionType === "mcq_multiple" ? (
                              <Checkbox checked={option.selected} disabled>
                                {option.text}
                              </Checkbox>
                            ) : (
                              <Radio checked={option.selected} disabled>
                                {option.text}
                              </Radio>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold uppercase text-slate-500">
                          Student Answer
                        </div>
                        <div>{question.textAnswer || "No answer provided"}</div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ) : null}
        </Modal>
      </div>
    );
  };

  return (
    <div className="theme-font flex h-screen overflow-hidden bg-gray-100">
      <aside className="hidden h-full w-[300px] shrink-0 bg-primary text-white shadow-lg lg:flex lg:flex-col">
        <div className="flex h-[155px] shrink-0 flex-col items-center justify-center gap-[15px] p-6">
          <img
            src={getSidebarLogo(appSettings)}
            alt="Academy logo"
            className="block h-[120px] w-[120px] min-w-[120px] rounded-full bg-white object-contain p-[6px]"
          />
        </div>
        <div className="mb-[10px] mt-[-12px] h-[2px] w-full bg-[#0e215fc7]" />
        <nav className="w-full flex-1 overflow-y-auto px-4 py-[10px]">
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => setActiveTab("student-info")}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-200 ${
                  activeTab === "student-info"
                    ? "border-[#2b418bc7] bg-[#0e215fc7] text-accent shadow-md"
                    : "border-primary bg-transparent text-accent hover:bg-[#0e215fc7]"
                }`}
              >
                <UserOutlined className="shrink-0 text-[22px]" />
                <span className="text-[14px] font-semibold">Student Info</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab("assigned-courses")}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-200 ${
                  activeTab === "assigned-courses"
                    ? "border-[#2b418bc7] bg-[#0e215fc7] text-accent shadow-md"
                    : "border-primary bg-transparent text-accent hover:bg-[#0e215fc7]"
                }`}
              >
                <BookOutlined className="shrink-0 text-[22px]" />
                <span className="text-[14px] font-semibold">Assigned Courses</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab("student-tests")}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-200 ${
                  activeTab === "student-tests"
                    ? "border-[#2b418bc7] bg-[#0e215fc7] text-accent shadow-md"
                    : "border-primary bg-transparent text-accent hover:bg-[#0e215fc7]"
                }`}
              >
                <SendOutlined className="shrink-0 text-[22px]" />
                <span className="text-[14px] font-semibold">Upcoming Tests</span>
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[#D1D6D4] bg-white p-4">
          <div className="flex w-full items-center justify-start gap-[12px]">
            <button
              type="button"
              className="flex h-[40px] w-[40px] items-center justify-center rounded-md border border-[#D1D6D4] bg-light"
              aria-label="Toggle sidebar size"
            >
              <TbArrowsMaximize />
            </button>
            <div className="form-input flex !h-[42px] w-1/3 items-center px-3 py-2">
              <FaSearch className="mr-2 text-gray-500" />
              <input
                type="text"
                placeholder="Search..."
                className="flex-1 bg-transparent text-gray-700 outline-none"
              />
            </div>
          </div>
          <div className="relative flex gap-[10px]">
            <div className="btn-md-cricle cursor-pointer">
              <FaCog className="text-xl text-gray-700" />
            </div>
            <Dropdown menu={profileMenu} trigger={["hover", "click"]} placement="bottomRight">
              <button className="btn-md-cricle cursor-pointer overflow-hidden" aria-label="Open profile menu">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt={user?.name || "profile"}
                    className="h-12 w-12 rounded-full border border-gray-300 object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-300 bg-[#01134C] text-sm font-semibold text-white shadow-sm">
                    {String(user?.name || "ST")
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}
              </button>
            </Dropdown>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <div className="w-full">
            <div className="mb-5 grid grid-cols-1 gap-4 lg:hidden">
              <button
                onClick={() => setActiveTab("student-info")}
                className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold ${
                  activeTab === "student-info" ? "border-primary bg-primary text-accent" : "border-slate-200 bg-white text-primary"
                }`}
              >
                Student Info
              </button>
              <button
                onClick={() => setActiveTab("assigned-courses")}
                className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold ${
                  activeTab === "assigned-courses" ? "border-primary bg-primary text-accent" : "border-slate-200 bg-white text-primary"
                }`}
              >
                Assigned Courses
              </button>
              <button
                onClick={() => setActiveTab("student-tests")}
                className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold ${
                  activeTab === "student-tests" ? "border-primary bg-primary text-accent" : "border-slate-200 bg-white text-primary"
                }`}
              >
                Upcoming Tests
              </button>
            </div>

            {activeTab === "student-info"
              ? renderStudentInfo()
              : activeTab === "assigned-courses"
                ? renderAssignedCourses()
                : renderStudentTests()}
          </div>
        </main>
      </div>

      <Modal
        title="Course Information"
        open={Boolean(selectedCourseInfo)}
        onCancel={() => setSelectedCourseInfo(null)}
        footer={[
          <Button key="close" type="primary" className="!bg-primary !border-primary" onClick={() => setSelectedCourseInfo(null)}>
            Close
          </Button>,
        ]}
        width={760}
      >
        {selectedCourseInfo ? (
          <div className="space-y-4">
            <Descriptions bordered column={2} size="middle">
              <Descriptions.Item label="Course Name" span={2}>
                {selectedCourseInfo.courseName}
              </Descriptions.Item>
              <Descriptions.Item label="Course Code">
                {selectedCourseInfo.courseId || "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="Category">
                {selectedCourseInfo.courseCategory || "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {selectedCourseInfo.duration
                  ? `${selectedCourseInfo.duration} month${Number(selectedCourseInfo.duration) === 1 ? "" : "s"}`
                  : "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="Total Fee">
                {selectedCourseInfo.totalFee !== undefined ? selectedCourseInfo.totalFee : "N/A"}
              </Descriptions.Item>
            </Descriptions>

            <div>
              <div className="mb-2 text-sm font-semibold text-primary">Assigned Batches</div>
              {selectedCourseBatches.length ? (
                <Table
                  rowKey="_id"
                  dataSource={selectedCourseBatches}
                  pagination={false}
                  size="small"
                  columns={[
                    { title: "Batch", dataIndex: "batchName" },
                    { title: "Code", dataIndex: "batchCode" },
                    { title: "Shift", dataIndex: "shift" },
                    { title: "Days", dataIndex: "days" },
                    { title: "Status", dataIndex: "status", render: (value) => <Tag color={value === "Active" ? "green" : "blue"}>{value || "N/A"}</Tag> },
                  ]}
                />
              ) : (
                <Empty description="No batch details found" />
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default StudentPortal;
