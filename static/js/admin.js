document.addEventListener("DOMContentLoaded", function () {
    fetchTeams();
    setupAddTeamForm();
    setupLoginForm();
    setupAddMemberForm();
});

function setupLoginForm() {
    const loginForm = document.getElementById("login");
    if (loginForm) {
        loginForm.addEventListener("submit", function (e) {
            e.preventDefault();
            console.log("Login form submitted");
            const username = document.getElementById("username").value;
            const password = document.getElementById("password").value;

            fetch("/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
            })
                .then((response) => {
                    console.log("Response status:", response.status);
                    const contentType = response.headers.get("content-type");
                    if (
                        contentType &&
                        contentType.indexOf("application/json") !== -1
                    ) {
                        return response
                            .json()
                            .then((data) => ({
                                status: response.status,
                                body: data,
                            }));
                    } else {
                        return response
                            .text()
                            .then((text) => ({
                                status: response.status,
                                body: text,
                            }));
                    }
                })
                .then(({ status, body }) => {
                    console.log("Response data:", body);
                    if (status === 200 && body.success) {
                        window.location.href = body.redirect;
                    } else {
                        showNotification(
                            body.message || "Login failed. Please try again.",
                            "error",
                        );
                    }
                })
                .catch((error) => {
                    console.error("Error:", error);
                    showNotification(
                        "An error occurred. Please try again.",
                        "error",
                    );
                });
        });
    } else {
        console.log("Login form not found");
    }
}

function validateCronExpression(cronExpression) {
    // Basic cron expression validation regex
    const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/[0-9]+)\s+(\*|([0-9]|1[0-9]|2[0-3])|\*\/[0-9]+)\s+(\*|([1-9]|[12][0-9]|3[01])|\*\/[0-9]+)\s+(\*|([1-9]|1[0-2])|\*\/[0-9]+)\s+(\*|([0-6])|\*\/[0-9]+)$/;
    return cronRegex.test(cronExpression.trim());
}

function setupAddTeamForm() {
    const addTeamForm = document.getElementById("add-team");
    const rotationScheduleInput = document.getElementById("team-rotation-schedule");
    
    rotationScheduleInput.addEventListener("input", function(e) {
        if (this.value && !validateCronExpression(this.value)) {
            this.setCustomValidity("Please enter a valid cron expression (e.g. 0 9 * * */2)");
        } else {
            this.setCustomValidity("");
        }
    });

    addTeamForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const teamName = document.getElementById("team-name").value;
        const rotationSchedule = rotationScheduleInput.value;

        if (!validateCronExpression(rotationSchedule)) {
            showNotification("Please enter a valid cron expression", "error");
            return;
        }

        fetch("/api/teams", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: teamName,
                rotation_schedule: rotationSchedule,
            }),
        })
            .then((response) => {
                if (!response.ok) {
                    return response.json().then((err) => {
                        throw err;
                    });
                }
                return response.json();
            })
            .then((data) => {
                showNotification("Team added successfully", "success");
                fetchTeams();
                addTeamForm.reset();
            })
            .catch((error) => {
                console.error("Error:", error);
                showNotification(
                    error.error || "Error adding team. Please try again.",
                    "error",
                );
            });
    });
}

function setupAddMemberForm() {
    const addMemberForm = document.getElementById("add-member");
    addMemberForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const teamId = document.getElementById("team-select").value;
        const memberName = document.getElementById("member-name").value;

        if (!teamId) {
            showNotification("Please select a team.", "error");
            return;
        }

        fetch(`/api/teams/${teamId}/members`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: memberName,
            }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                return response.json();
            })
            .then((data) => {
                showNotification("Member added successfully", "success");
                fetchTeamMembers(teamId);
                addMemberForm.reset();
            })
            .catch((error) => {
                console.error("Error:", error);
                showNotification(
                    "Error adding member. Please try again.",
                    "error",
                );
            });
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const debouncedEditTeam = debounce(editTeam, 300);

function setupEditTeamButtons() {
    const editButtons = document.querySelectorAll(".edit-team");
    editButtons.forEach((button) => {
        button.addEventListener("click", function (e) {
            e.stopPropagation();
            const teamId = this.getAttribute("data-team-id");
            if (!teamId) {
                console.error("No team ID found for edit button");
                showNotification("Error: Invalid team ID", "error");
                return;
            }
            const teamItem = this.closest("li");
            if (!teamItem.hasAttribute("data-editing")) {
                closeAllEditForms();
                debouncedEditTeam(teamId);
            }
        });
    });
}

function editTeam(teamId) {
    console.log(`Editing team with ID: ${teamId}`);
    const existingForm = document.querySelector(".edit-team-form");
    if (existingForm) {
        existingForm.remove();
    }

    fetch(`/api/teams/${teamId}`)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then((team) => {
            console.log("Received team data:", team);
            const editForm = document.createElement("form");
            editForm.innerHTML = `
                <input type="text" id="edit-team-name" value="${team.name}" required>
                <input type="text" id="edit-team-rotation-schedule" value="${team.rotation_schedule || ""}" placeholder="Rotation Schedule (e.g. 0 9 * * */2)" required>
                <button type="submit" class="bg-green-500 text-white py-1 px-2 rounded text-sm hover:bg-green-600 transition duration-300">Save Changes</button>
                <button type="button" class="bg-gray-500 text-white py-1 px-2 rounded text-sm hover:bg-gray-600 transition duration-300 cancel-edit">Cancel</button>
            `;

            editForm.classList.add("edit-team-form", "active-edit-form");

            const rotationScheduleInput = editForm.querySelector("#edit-team-rotation-schedule");
            rotationScheduleInput.addEventListener("input", function(e) {
                if (this.value && !validateCronExpression(this.value)) {
                    this.setCustomValidity("Please enter a valid cron expression (e.g. 0 9 * * */2)");
                } else {
                    this.setCustomValidity("");
                }
            });

            editForm.addEventListener("submit", function (e) {
                e.preventDefault();
                const rotationSchedule = rotationScheduleInput.value;
                if (!validateCronExpression(rotationSchedule)) {
                    showNotification("Please enter a valid cron expression", "error");
                    return;
                }
                updateTeam(teamId, this);
            });

            const cancelButton = editForm.querySelector(".cancel-edit");
            cancelButton.addEventListener("click", function () {
                cancelEdit(teamId);
            });

            const teamItem = document
                .querySelector(`li [data-team-id="${teamId}"]`)
                .closest("li");
            teamItem.setAttribute("data-editing", "true");
            teamItem.appendChild(editForm);
        })
        .catch((error) => {
            console.error("Error fetching team details:", error);
            showNotification(
                `Error fetching team details: ${error.message}`,
                "error",
            );
        });
}

function fetchTeams() {
    fetch("/api/teams")
        .then((response) => response.json())
        .then((teams) => {
            const teamList = document.getElementById("team-list");
            const teamSelect = document.getElementById("team-select");
            teamList.innerHTML = "";
            teamSelect.innerHTML = '<option value="">Select Team</option>';
            teams.forEach((team) => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <div class="flex justify-between items-center w-full">
                        <span>${team.name}</span>
                        <div>
                            <button class="edit-team remove-member mr-2" data-team-id="${team.id}">Edit</button>
                            <button class="delete-team remove-member" data-team-id="${team.id}">Delete</button>
                        </div>
                    </div>
                `;
                teamList.appendChild(li);

                const option = document.createElement("option");
                option.value = team.id;
                option.textContent = team.name;
                teamSelect.appendChild(option);
            });
            setupDeleteTeamButtons();
            setupEditTeamButtons();
        })
        .catch((error) => {
            console.error("Error fetching teams:", error);
            showNotification(
                "Error fetching teams. Please try again.",
                "error",
            );
        });
}

function setupDeleteTeamButtons() {
    const deleteButtons = document.querySelectorAll(".delete-team");
    deleteButtons.forEach((button) => {
        button.addEventListener("click", function () {
            const teamId = this.getAttribute("data-team-id");
            deleteTeam(teamId);
        });
    });
}

function deleteTeam(teamId) {
    fetch(`/api/teams/${teamId}`, {
        method: "DELETE",
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        })
        .then((data) => {
            showNotification("Team deleted successfully", "success");
            fetchTeams();
        })
        .catch((error) => {
            console.error("Error:", error);
            showNotification("Error deleting team. Please try again.", "error");
        });
}

function closeAllEditForms() {
    const activeForms = document.querySelectorAll(".active-edit-form");
    activeForms.forEach((form) => {
        const teamItem = form.closest("li");
        form.remove();
        teamItem.removeAttribute("data-editing");
    });
}

document.addEventListener("click", function (e) {
    if (
        !e.target.closest(".edit-team-form") &&
        !e.target.classList.contains("edit-team")
    ) {
        closeAllEditForms();
    }
});

function cancelEdit(teamId) {
    const teamItem = document
        .querySelector(`[data-team-id="${teamId}"]`)
        .closest("li");
    const editForm = teamItem.querySelector(".edit-team-form");
    if (editForm) {
        editForm.remove();
        teamItem.removeAttribute("data-editing");
    }
}

function updateTeam(teamId, form) {
    console.log(`Updating team ${teamId}`);
    const name = form.querySelector("#edit-team-name").value;
    const rotationSchedule = form.querySelector(
        "#edit-team-rotation-schedule",
    ).value;

    if (!validateCronExpression(rotationSchedule)) {
        showNotification("Please enter a valid cron expression", "error");
        return;
    }

    console.log(
        `Team data: name=${name}, rotation_schedule=${rotationSchedule}`,
    );

    fetch(`/api/teams/${teamId}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: name,
            rotation_schedule: rotationSchedule,
        }),
    })
        .then((response) => {
            if (!response.ok) {
                return response.json().then((err) => {
                    throw err;
                });
            }
            return response.json();
        })
        .then((data) => {
            console.log("Team updated successfully:", data);
            showNotification("Team updated successfully", "success");
            fetchTeams();
            cancelEdit(teamId);
        })
        .catch((error) => {
            console.error("Error updating team:", error);
            showNotification(
                error.error || `Error updating team: ${error.message}`,
                "error",
            );
        });
}

function fetchTeamMembers(teamId) {
    fetch(`/api/teams/${teamId}/members`)
        .then((response) => response.json())
        .then((members) => {
            setupMemberList(members, teamId);
            setupSortableMemberList(teamId);
        })
        .catch((error) => console.error('Error fetching team members:', error));
}

function setupMemberList(members, teamId) {
    const memberList = document.getElementById("member-list");
    memberList.innerHTML = "";
    members.forEach((member) => {
        const memberItem = document.createElement("li");
        memberItem.className = "member-item";
        memberItem.setAttribute("data-id", member.id);
        memberItem.setAttribute("data-team-id", teamId);
        memberItem.innerHTML = `
            <span>${member.name}</span>
            <button class="remove-member bg-red-500 text-white py-1 px-2 rounded text-sm hover:bg-red-600 transition duration-300" data-member-id="${member.id}" data-team-id="${teamId}">Remove</button>
        `;
        memberList.appendChild(memberItem);
    });

    const removeButtons = document.querySelectorAll(".remove-member");
    removeButtons.forEach((button) => {
        button.addEventListener("click", function () {
            const memberId = this.getAttribute("data-member-id");
            const teamId = this.getAttribute("data-team-id");
            if (memberId && teamId) {
                removeMember(teamId, memberId);
            } else {
                console.error("Invalid member ID or team ID");
                showNotification("Error: Invalid member or team", "error");
            }
        });
    });
}

function removeMember(teamId, memberId) {
    fetch(`/api/teams/${teamId}/members/${memberId}/remove`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        })
        .then((data) => {
            showNotification("Member removed successfully", "success");
            fetchTeamMembers(teamId);
        })
        .catch((error) => {
            console.error("Error:", error);
            showNotification(
                "Error removing member. Please try again.",
                "error",
            );
        });
}

function setupSortableMemberList(teamId) {
    const memberList = document.getElementById("member-list");
    if (!memberList) {
        console.error("Member list element not found");
        return;
    }
    if (!teamId) {
        console.error("Invalid team ID provided to setupSortableMemberList");
        return;
    }
    console.log("Setting up sortable member list for team:", teamId);
    new Sortable(memberList, {
        animation: 150,
        ghostClass: "blue-background-class",
        onEnd: function (evt) {
            console.log("Drag ended, updating order");
            const newOrder = Array.from(memberList.children)
                .filter(li => li.getAttribute("data-id"))
                .map(li => li.getAttribute("data-id"));
            console.log("New order:", newOrder);
            if (newOrder.length > 0) {
                updateMemberOrder(teamId, newOrder);
            } else {
                console.error("No valid member IDs found in the new order");
            }
        },
    });
}

function updateMemberOrder(teamId, newOrder) {
    if (!teamId || !Array.isArray(newOrder) || newOrder.length === 0) {
        console.error("Invalid team ID or new order provided to updateMemberOrder");
        return;
    }
    console.log("Updating member order for team:", teamId);
    console.log("New order:", newOrder);
    fetch(`/api/teams/${teamId}/members/reorder`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ order: newOrder }),
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then((data) => {
            console.log("Member order updated successfully:", data);
            showNotification("Member order updated successfully", "success");
        })
        .catch((error) => {
            console.error("Error updating member order:", error);
            showNotification(
                "Error updating member order. Please try again.",
                "error"
            );
        });
}

function showNotification(message, type = "success") {
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.className = `fixed top-0 right-0 m-4 p-2 rounded ${type === "success" ? "bg-green-500" : "bg-red-500"} text-white`;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

document.getElementById("team-select").addEventListener("change", function () {
    const teamId = this.value;
    if (teamId) {
        fetchTeamMembers(teamId);
    } else {
        document.getElementById("member-list").innerHTML = "";
    }
});