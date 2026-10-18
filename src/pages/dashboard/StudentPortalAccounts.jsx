import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  KeyOutlined,
  ReloadOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { deleteAdmin } from "../../services/adminService";
import { getAllBatches } from "../../services/batchService";
import { getCourses } from "../../services/feeService";
import {
  createStudentPortalAccounts,
  deleteAllStudentPortalAccounts,
  getStudentPortalAccounts,
  previewStudentPortalAccounts,
  updateStudentPortalAccountStatus,
} from "../../services/studentPortalAccountService";

const StudentPortalAccounts = () => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [searchText, setSearchText] = useState("");
  const watchedCourseIds = Form.useWatch("courseIds", { form, preserve: true });
  const watchedBatchIds = Form.useWatch("batchIds", { form, preserve: true });
  const selectedCourseIds = useMemo(() => watchedCourseIds || [], [watchedCourseIds]);
  const selectedBatchIds = useMemo(() => watchedBatchIds || [], [watchedBatchIds]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accountsResponse, coursesResponse, batchesResponse] = await Promise.all([
        getStudentPortalAccounts(),
        getCourses(),
        getAllBatches(),
      ]);
      setAccounts(accountsResponse.data || []);
      setCourses(coursesResponse.data || []);
      setBatches(batchesResponse.data || []);
    } catch (error) {
      message.error(error.message || "Failed to load student portal accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const courseOptions = useMemo(
    () =>
      courses.map((course) => ({
        label: `${course.courseName} (${course.courseId})`,
        value: course._id,
      })),
    [courses],
  );

  const availableBatches = useMemo(
    () =>
      selectedCourseIds.length
        ? batches.filter((batch) =>
            selectedCourseIds.some(
              (courseId) => String(batch.course?._id || batch.course) === String(courseId),
            ),
          )
        : batches,
    [batches, selectedCourseIds],
  );

  const batchOptions = useMemo(
    () =>
      availableBatches.map((batch) => ({
        label: `${batch.batchName} (${batch.batchCode})`,
        value: batch._id,
        searchLabel: `${batch.batchName} ${batch.batchCode} ${batch.course?.courseName || ""}`,
      })),
    [availableBatches],
  );

  const filteredAccounts = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return accounts.filter((account) =>
      (!selectedCourseIds.length ||
        (account.courses || []).some((course) =>
          selectedCourseIds.includes(String(course._id || course)),
        )) &&
      (!selectedBatchIds.length ||
        (account.batches || []).some((batch) =>
          selectedBatchIds.includes(String(batch._id || batch)),
        )) &&
      (!keyword ||
        [
          account.name,
          account.email,
          account.registrationNo,
          account.phone,
          ...(account.courses || []).map((course) => course.courseName),
          ...(account.batches || []).map((batch) => batch.batchName),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword)),
    );
  }, [accounts, searchText, selectedCourseIds, selectedBatchIds]);

  const handlePreview = async () => {
    const values = await form.validateFields();
    setCreating(true);
    try {
      const response = await previewStudentPortalAccounts(values);
      setPreview(response.data);
    } catch (error) {
      message.error(error.message || "Failed to preview accounts");
    } finally {
      setCreating(false);
    }
  };

  const selectAllBatches = () => {
    if (!batchOptions.length) {
      message.info("No batches are available for the selected courses.");
      return;
    }
    const batchIds = batchOptions.map((batch) => batch.value);
    form.setFieldValue("batchIds", batchIds);
    setPreview(null);
    message.success(`${batchIds.length} batch${batchIds.length === 1 ? "" : "es"} selected`);
  };

  const handleCreate = async () => {
    const values = form.getFieldsValue();
    setCreating(true);
    try {
      const response = await createStudentPortalAccounts(values);
      const created = response.data?.created?.length || 0;
      const skipped = response.data?.skipped?.length || 0;
      message.success(`${created} account(s) created. ${skipped} existing account(s) skipped.`);
      setPreview(null);
      await loadData();
    } catch (error) {
      message.error(error.message || "Failed to create accounts");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAll = async () => {
    if (deleteConfirmation !== "DELETE") return;
    setDeletingAll(true);
    try {
      const response = await deleteAllStudentPortalAccounts();
      message.success(response.message || "All student portal accounts deleted.");
      setDeleteAllOpen(false);
      setDeleteConfirmation("");
      setPreview(null);
      await loadData();
    } catch (error) {
      message.error(error.message || "Failed to delete student portal accounts");
    } finally {
      setDeletingAll(false);
    }
  };

  const copyLogin = async (account) => {
    const text = `Student Portal Login\nName: ${account.name}\nEmail: ${account.email}\nPassword: ${account.initialPassword}`;
    await navigator.clipboard.writeText(text);
    message.success("Login details copied");
  };

  const columns = [
    {
      title: "Student",
      key: "student",
      render: (_, account) => (
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-primary">{account.name}</div>
          <div className="mt-1 text-[11px] text-slate-500">{account.registrationNo || "No registration"}</div>
        </div>
      ),
    },
    {
      title: "Login Email",
      dataIndex: "email",
      key: "email",
      render: (value) => <span className="text-[12px] text-slate-700">{value}</span>,
    },
    {
      title: "Password",
      dataIndex: "initialPassword",
      key: "initialPassword",
      render: (value) => <Tag color="gold" className="!text-[12px]">{value || "Updated by student"}</Tag>,
    },
    {
      title: "Courses",
      key: "courses",
      render: (_, account) => (
        <div className="flex flex-wrap gap-1">
          {(account.courses || []).slice(0, 2).map((course) => (
            <Tag key={course._id} color="blue" className="!text-[12px]">{course.courseName}</Tag>
          ))}
          {(account.courses || []).length > 2 ? <Tag>+{account.courses.length - 2}</Tag> : null}
        </div>
      ),
    },
    {
      title: "Batches",
      key: "batches",
      render: (_, account) => (
        <div className="flex flex-wrap gap-1">
          {(account.batches || []).slice(0, 2).map((batch) => (
            <Tag key={batch._id} color="cyan" className="!text-[12px]">{batch.batchName}</Tag>
          ))}
          {(account.batches || []).length > 2 ? <Tag>+{account.batches.length - 2}</Tag> : null}
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      render: (_, account) => (
        <Space>
          <Switch
            checked={account.isActive}
            onChange={async (checked) => {
              await updateStudentPortalAccountStatus(account._id, checked);
              message.success(`Student account ${checked ? "activated" : "blocked"}`);
              loadData();
            }}
          />
          <Tag color={account.isActive ? "green" : "red"}>
            {account.isActive ? "Active" : "Blocked"}
          </Tag>
        </Space>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, account) => (
        <Space>
          <Button size="middle" icon={<CopyOutlined />} onClick={() => copyLogin(account)}>
            Copy
          </Button>
          <Popconfirm
            title="Delete student account"
            description="This removes only the portal login account, not the student admission record."
            onConfirm={async () => {
              await deleteAdmin(account._id);
              message.success("Student portal account deleted");
              loadData();
            }}
            okButtonProps={{ danger: true }}
          >
            <Button danger size="middle" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="theme-font space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <KeyOutlined style={{ color: "#E8FC0A", fontSize: 21 }} />
          </div>
          <div>
            <h2 className="module-title">Student Portal Accounts</h2>
            <p className="module-subtitle">Create, copy, block, and manage student login details</p>
          </div>
        </div>
        <Button className="h-10 rounded-lg" icon={<ReloadOutlined />} onClick={loadData}>Refresh</Button>
      </div>

      <div className="rounded-[16px] border border-slate-200 bg-white p-4 md:p-5">
        <Form form={form} layout="vertical">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8ea2c4]">
                Create New Student Accounts
              </div>
              <div className="mt-1 text-[11px] text-[#64748b]">
                Only active students enrolled in the selected courses and batches are included.
              </div>
            </div>
            <Button className="h-9 rounded-lg" onClick={selectAllBatches}>
              Select All Batches
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Form.Item name="courseIds" label="Courses">
              <Select
                className="course-multi-select student-portal-control"
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Select courses or leave empty"
                options={courseOptions}
                maxTagCount={3}
                maxTagPlaceholder={(omittedValues) => `+${omittedValues.length} more`}
                onChange={(values) => {
                  const courseIds = values || [];
                  const selectedCourseSet = new Set(courseIds.map(String));
                  const allowedBatchIds = new Set(
                    batches
                      .filter((batch) =>
                        !courseIds.length ||
                        selectedCourseSet.has(
                          String(batch.course?._id || batch.course),
                        ),
                      )
                      .map((batch) => String(batch._id)),
                  );
                  const currentBatchIds = form.getFieldValue("batchIds") || [];
                  form.setFieldValue(
                    "batchIds",
                    currentBatchIds.filter((batchId) => allowedBatchIds.has(String(batchId))),
                  );
                  setPreview(null);
                }}
              />
            </Form.Item>
            <Form.Item name="batchIds" label="Batches">
              <Select
                className="course-multi-select student-portal-control"
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="searchLabel"
                placeholder="Select batches or leave empty"
                options={batchOptions}
                maxTagCount={3}
                maxTagPlaceholder={(omittedValues) => `+${omittedValues.length} more`}
                onChange={() => setPreview(null)}
              />
            </Form.Item>
            <Form.Item label=" ">
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                loading={creating}
                onClick={handlePreview}
                className="h-[56px] w-full rounded-[10px] !bg-primary !border-primary font-semibold"
              >
                Preview Accounts
              </Button>
            </Form.Item>
          </div>
        </Form>
      </div>

      <div className="rounded-[16px] border border-slate-200 bg-white p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8ea2c4]">
              Portal Accounts
            </div>
            <div className="mt-1 text-[11px] text-[#64748b]">
              {filteredAccounts.length} account{filteredAccounts.length === 1 ? "" : "s"} found
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input.Search
              allowClear
              className="student-portal-search md:w-[430px]"
              placeholder="Search by student, email, course, batch..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!accounts.length}
              onClick={() => setDeleteAllOpen(true)}
            >
              Delete All Accounts
            </Button>
          </div>
        </div>
        {accounts.length ? (
          <Table
            rowKey="_id"
            loading={loading}
            dataSource={filteredAccounts}
            columns={columns}
            className="student-portal-table custom-pagination-table"
            pagination={{ pageSize: 8 }}
            scroll={{ x: "max-content" }}
          />
        ) : (
          <Empty description={loading ? "Loading accounts..." : "No student portal accounts found"} />
        )}
      </div>

      <Modal
        title="Create Student Portal Accounts"
        open={Boolean(preview)}
        onCancel={() => setPreview(null)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="Create Accounts"
        okButtonProps={{
          className: "!bg-primary !border-primary",
          disabled: !preview?.totalStudents,
        }}
        width={760}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Active Students</div>
            <div className="text-xl font-ArialBold text-primary">{preview?.totalStudents || 0}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">New Accounts</div>
            <div className="text-xl font-ArialBold text-green-700">{preview?.newAccounts || 0}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Already Created</div>
            <div className="text-xl font-ArialBold text-amber-700">{preview?.existingAccounts || 0}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Pass-outs</div>
            <div className="text-xl font-ArialBold text-slate-600">{preview?.skippedEnrollments?.completed || 0}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Dropouts</div>
            <div className="text-xl font-ArialBold text-red-600">{preview?.skippedEnrollments?.dropped || 0}</div>
          </div>
        </div>
        {(preview?.skippedEnrollments?.total > 0 || !preview?.totalStudents) ? (
          <Alert
            className="mt-4"
            type="warning"
            showIcon
            message={
              preview?.totalStudents
                ? `${preview.skippedEnrollments.total} pass-out/dropout student(s) will be skipped.`
                : "No active students are available for account creation."
            }
            description="Only currently active enrollments are eligible. Pass-outs and dropouts will not have accounts created."
          />
        ) : null}
        <div className="mt-4 max-h-[280px] overflow-auto rounded-lg border border-slate-200">
          {(preview?.students || []).map((student) => (
            <div key={student.studentId} className="flex items-center justify-between border-b border-slate-100 px-3 py-2 last:border-b-0">
              <div>
                <div className="text-sm font-semibold text-primary">{student.studentName}</div>
                <div className="text-xs text-slate-500">{student.registrationNo || "No registration"}</div>
              </div>
              <Tag color={student.alreadyCreated ? "orange" : "green"}>
                {student.alreadyCreated ? "Existing" : "Ready"}
              </Tag>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        title="Delete all student portal accounts?"
        open={deleteAllOpen}
        onCancel={() => {
          if (deletingAll) return;
          setDeleteAllOpen(false);
          setDeleteConfirmation("");
        }}
        onOk={handleDeleteAll}
        confirmLoading={deletingAll}
        okText="Delete All Accounts"
        okButtonProps={{ danger: true, disabled: deleteConfirmation !== "DELETE" }}
        cancelButtonProps={{ disabled: deletingAll }}
      >
        <p>
          This permanently deletes {accounts.length} student portal login account(s). Student admission records,
          course and batch enrollments, and non-student accounts will remain unchanged.
        </p>
        <p className="mt-3">Type <strong>DELETE</strong> to confirm.</p>
        <Input
          autoComplete="off"
          value={deleteConfirmation}
          onChange={(event) => setDeleteConfirmation(event.target.value)}
          disabled={deletingAll}
        />
      </Modal>
    </div>
  );
};

export default StudentPortalAccounts;
