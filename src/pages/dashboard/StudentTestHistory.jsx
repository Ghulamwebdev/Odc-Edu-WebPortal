import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, Empty, Input, Select, Statistic, Table, Tag, message } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import useZustandStore from "../../stores/zustandStore";
import { getStudentTestHistory } from "../../services/testStudioService";

const submittedStatuses = new Set(["submitted", "auto_submitted", "graded"]);

const formatDate = (date) => (date ? dayjs(date).format("DD MMM YYYY, hh:mm A") : "—");

const getAttemptTag = (status) => {
  if (submittedStatuses.has(status)) {
    return <Tag color="green">{status.replaceAll("_", " ")}</Tag>;
  }
  if (status === "in_progress") return <Tag color="blue">In progress</Tag>;
  if (status === "expired") return <Tag color="volcano">Expired</Tag>;
  return <Tag color="orange">Not started</Tag>;
};

const StudentTestHistory = () => {
  const { studentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const adminInfo = useZustandStore((state) => state.adminInfo);
  const employeeMode =
    String(adminInfo?.userData?.role || "").toLowerCase() === "employee";
  const testStudioBasePath = employeeMode
    ? "/employee-dashboard/test-studio"
    : "/dashboard/test-studio";
  const [student, setStudent] = useState(null);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [attemptFilter, setAttemptFilter] = useState("all");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getStudentTestHistory(studentId);
      setStudent(response.data?.student || null);
      setTests((response.data?.tests || []).filter((test) => !test.isDeleted));
    } catch (error) {
      message.error(error.message || "Failed to load student test history.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const submittedTests = useMemo(
    () => tests.filter((test) => submittedStatuses.has(test.status)),
    [tests],
  );
  const passedCount = submittedTests.filter((test) => test.passed).length;
  const failedCount = submittedTests.length - passedCount;
  const pendingCount = tests.filter((test) => test.status === "not_started").length;
  const inProgressCount = tests.filter((test) => test.status === "in_progress").length;
  const filteredTests = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return tests.filter((test) => {
      const matchesSearch = !keyword ||
        [test.title, test.topic, test.course?.courseName, test.batch?.batchName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      const matchesAttempt =
        attemptFilter === "all" ||
        (attemptFilter === "passed" && submittedStatuses.has(test.status) && test.passed) ||
        (attemptFilter === "failed" && submittedStatuses.has(test.status) && !test.passed) ||
        (attemptFilter === "in_progress" && test.status === "in_progress") ||
        (attemptFilter === "not_started" && test.status === "not_started");
      return matchesSearch && matchesAttempt;
    });
  }, [attemptFilter, search, tests]);

  const columns = [
    {
      title: "Test",
      width: 145,
      render: (_, test) => (
        <div className="min-w-0">
          <div className="font-semibold text-primary">{test.title}</div>
          {test.topic ? <div className="text-xs text-slate-500">{test.topic}</div> : null}
        </div>
      ),
    },
    {
      title: "Course / Batch",
      width: 170,
      render: (_, test) => (
        <div className="min-w-0">
          <div className="break-words">{test.course?.courseName || "—"}</div>
          <div className="text-xs text-slate-500">{test.batch?.batchName || "—"}</div>
        </div>
      ),
    },
    {
      title: "Status",
      width: 125,
      render: (_, test) => (
        <div className="flex flex-col items-start gap-1">
          <Tag color={test.testStatus === "completed" ? "purple" : test.testStatus === "live" ? "green" : "blue"}>
            Test: {test.testStatus}
          </Tag>
          {getAttemptTag(test.status)}
        </div>
      ),
    },
    {
      title: "Result / Score",
      width: 130,
      render: (_, test) => {
        return (
          <div className="flex flex-col items-start gap-1">
            {submittedStatuses.has(test.status) ? (
              <Tag color={test.passed ? "success" : "error"}>
                {test.passed ? "Passed" : "Failed"}
              </Tag>
            ) : <Tag>Not evaluated</Tag>}
            <span>{test.score} / {test.totalMarks} ({test.percentage}%)</span>
          </div>
        );
      },
    },
    {
      title: "Answer summary",
      width: 135,
      render: (_, test) => (
        <div className="flex flex-wrap gap-1">
          <Tag color="green">{test.answerSummary?.right || 0} right</Tag>
          <Tag color="red">{test.answerSummary?.wrong || 0} wrong</Tag>
          {test.answerSummary?.needsReview ? (
            <Tag color="orange">{test.answerSummary.needsReview} review</Tag>
          ) : null}
        </div>
      ),
    },
    {
      title: "Pass / Questions",
      width: 110,
      render: (_, test) => (
        <div>
          <div>{test.passingMarks} marks to pass</div>
          <div className="text-xs text-slate-500">{test.questionCount} questions</div>
        </div>
      ),
    },
    {
      title: "Timeline",
      width: 185,
      render: (_, test) => (
        <div className="space-y-1 text-xs">
          <div><span className="font-medium">Scheduled:</span> {formatDate(test.startAt)}</div>
          <div><span className="font-medium">Started:</span> {formatDate(test.startedAt)}</div>
          <div><span className="font-medium">Submitted:</span> {formatDate(test.submittedAt)}</div>
        </div>
      ),
    },
    {
      title: "Actions",
      width: 95,
      render: (_, test) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`${testStudioBasePath}/${test.testId}`)}
        >
          Test details
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Button
            type="link"
            className="!px-0"
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              const sourceTestId = searchParams.get("from");
              navigate(sourceTestId ? `${testStudioBasePath}/${sourceTestId}` : testStudioBasePath);
            }}
          >
            Back to test results
          </Button>
          <h2 className="module-title">Student Test History</h2>
          <p className="module-subtitle">
            All assigned assessments and results for this student
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadHistory} loading={loading}>
          Refresh
        </Button>
      </div>

      <Card className="rounded-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-700">
            {(student?.studentName || "S").trim().charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="m-0 text-lg font-bold text-slate-900">
              {student?.studentName || "Student"}
            </h3>
            <div className="text-sm text-slate-500">
              Registration: {student?.registrationNo || "Not available"}
            </div>
          </div>
          <div className="sm:ml-auto">
            <Tag color="blue">{tests.length} assigned tests</Tag>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card><Statistic title="Assigned tests" value={tests.length} /></Card>
        <Card><Statistic title="Submitted" value={submittedTests.length} prefix={<CheckCircleOutlined />} /></Card>
        <Card><Statistic title="Passed" value={passedCount} valueStyle={{ color: "#16a34a" }} /></Card>
        <Card><Statistic title="Failed" value={failedCount} valueStyle={{ color: "#dc2626" }} /></Card>
        <Card><Statistic title="In progress / pending" value={inProgressCount + pendingCount} /></Card>
      </div>

      <Card title="Assessment Results" className="rounded-2xl">
        <div className="mb-4 flex flex-col gap-2 md:flex-row">
          <Input.Search
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search test, course, or batch"
            className="md:max-w-sm"
          />
          <Select
            value={attemptFilter}
            onChange={setAttemptFilter}
            className="md:w-52"
            options={[
              { label: "All test results", value: "all" },
              { label: "Passed", value: "passed" },
              { label: "Failed", value: "failed" },
              { label: "In progress", value: "in_progress" },
              { label: "Not started", value: "not_started" },
            ]}
          />
        </div>
        <Table
          rowKey="testId"
          loading={loading}
          columns={columns}
          dataSource={filteredTests}
          tableLayout="fixed"
          pagination={{ pageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: <Empty description="No assigned tests found for this student" /> }}
        />
      </Card>
    </div>
  );
};

export default StudentTestHistory;
